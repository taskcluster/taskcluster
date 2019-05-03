const assert = require('assert');
const fs = require('fs');
const taskcluster = require('taskcluster-client');
const libUrls = require('taskcluster-lib-urls');
const uuid = require('uuid');
const {TimedCache} = require('./timedcache');
const {google} = require('googleapis');
const {Provider} = require('./provider');

class GoogleProvider extends Provider {

  constructor({
    name,
    taskclusterCredentials,
    monitor,
    estimator,
    notify,
    provisionerId,
    rootUrl,
    project,
    instancePermissions,
    creds,
    credsFile,
    Worker,
  }) {
    super({name, taskclusterCredentials, monitor, notify, provisionerId, rootUrl, estimator, Worker});
    this.cache = new TimedCache();

    this.instancePermissions = instancePermissions;
    this.project = project;

    this.providerVersion = 'v1'; // Bump this if you change this in a backwards-incompatible way

    if (!creds && credsFile) {
      creds = JSON.parse(fs.readFileSync(credsFile));
    }
    this.ownClientEmail = creds.client_email;
    const client = google.auth.fromJSON(creds);
    client.scopes = [
      'https://www.googleapis.com/auth/compute', // For configuring instance templates, groups, etc
      'https://www.googleapis.com/auth/iam', // For setting up service accounts for each workertype
      'https://www.googleapis.com/auth/cloud-platform', // To set roles for service accounts
    ];
    this.compute = google.compute({
      version: 'v1',
      auth: client,
    });
    this.iam = google.iam({
      version: 'v1',
      auth: client,
    });
    this.crm = google.cloudresourcemanager({
      version: 'v1',
      auth: client,
    });

    this.oauth2 = new google.auth.OAuth2();
  }

  /**
   * Given a workerType and instance identity token from google, we return
   * taskcluster credentials for a worker to use if it is valid.
   *
   * All fields we check in the token are signed by google rather than the
   * requester so we know that they are not forged arbitrarily. Be careful
   * when selecting new fields to validate here, they may come from the requester.
   */
  async verifyIdToken({token, workerType}) {
    // This will throw an error if the token is invalid at all
    let {payload} = await this.oauth2.verifyIdToken({
      idToken: token,
      audience: workerType.name,
    });
    const dat = payload.google.compute_engine;

    // First check to see if the request is coming from the project this provider manages
    if (dat.project_id !== this.project) {
      const error = new Error(`Invalid project ${dat.project_id} is not ${this.project}`);
      error.project = dat.project_id;
      error.validProject = this.project;
      throw error;
    }

    // Now check to make sure that the serviceAccount that the worker has is the
    // serviceAccount that we have configured that worker to use. Nobody else in the project
    // should have permissions to create instances with this serviceAccount.
    if (payload.sub !== workerType.providerData.serviceAccountId) {
      const error = new Error('Attempt to claim workertype creds from non-workertype instance');
      error.requestingAccountId = payload.sub;
      error.correctAccountId = workerType.providerData.serviceAccountId;
      throw error;
    }

    // Google docs say instance id is globally unique even across projects
    const workerId = `gcp-${dat.instance_id}`;

    // This will throw an error if the workertype already checked in.
    // Workers that fail to get creds after this should terminate themselves
    await this.Worker.create({
      workerType: workerType.name,
      workerId,
      credentialed: new Date(),
    });

    return taskcluster.createTemporaryCredentials({
      clientId: `worker/google/${this.project}/${dat.instance_id}`,
      scopes: [
        `assume:worker-type:${this.provisionerId}/${workerType.name}`,
        `assume:worker-id:${workerId}`,
      ],
      start: taskcluster.fromNow('-15 minutes'),
      expiry: taskcluster.fromNow('96 hours'),
      credentials: this.taskclusterCredentials,
    });
  }

  async prepare() {
    this.seen = {};
  }

  async provision({workerType}) {
    const {email: accountEmail} = await this.configureServiceAccount({workerType});
    const {name: roleId} = await this.configureRole({workerType});

    // The account policies are global to a project so we'll update them
    // in cleanup to avoid lots of contention and this will also allow us to
    // know which types need removed!
    this.seen[roleId] = accountEmail;

    if (!await this.ensureImage({workerType})) {
      return;
    }

    const template = await this.setupTemplate({workerType, accountEmail});
    if (!template) {
      return; // The template is in the process of being created. Once it is complete we will continue
    }

    const currentSize = workerType.providerData.targetSize !== undefined ? workerType.providerData.targetSize : 0;

    const targetSize = await this.estimator.simple({
      name: workerType.name,
      ...workerType.config,
      currentSize,
    });

    await workerType.modify(wt => {
      wt.providerData.targetSize = targetSize;
    });

    await this.setupInstanceGroup({workerType, template, targetSize});

    await this.handleOperations({workerType});
  }

  /*
   * Given the list of seen workertypes from this loop,
   * go update the policies for this project so that existing
   * service accounts get proper role assignments and removing
   * deleted workertypes. This will also remove the role and service
   * account per deleted workertype.
   */
  async cleanup() {
    const policy = (await this.crm.projects.getIamPolicy({
      resource: this.project,
      requestBody: {},
    })).data;

    // TODO: document and test that taskcluster.workertype is a required role prefix
    const existing = policy.bindings
      .map(p => p.role)
      .filter(r => r.startsWith(`projects/${this.project}/roles/taskcluster.workertype`));
    const toDelete = existing.filter(r => !this.seen[r]);
    const toAdd = Object.keys(this.seen).filter(r => !existing.includes(r));

    // In this case, nothing has changed, let's move on
    if (!toAdd.length && !toDelete.length) {
      return;
    }

    // Do all of this cleanup first so that if anything fails
    // the workertype will still be listed in the account policies next time around
    // to finish cleanup.
    for (const workerType of toDelete) {
      // First delete instancegroup
      // second the templates
      // next the role
      // then the serviceaccount
      console.log(workerType);
    }

    for (const role of toAdd) {
      policy.bindings.push({
        role,
        members: [`serviceAccount:${this.seen[role]}`],
      });
    }

    // TODO: Handle etag conflict with retries or document that
    // this can fail and will be re-attempted on the next iteration
    await this.crm.projects.setIamPolicy({
      resource: this.project,
      requestBody: {
        policy,
      },
    });
  }

  async ensureImage({workerType}) {
    try {
      await this.compute.images.get({
        project: this.project,
        image: workerType.config.image,
      });
    } catch (err) {
      if (err.code !== 404) {
        throw err;
      }
      await workerType.reportError({
        kind: 'unknown-image',
        title: 'Unknown Image',
        description: 'Image does not exist in project. Possibly the image was generated in a different project?',
        extra: {
          image: workerType.config.image,
          project: this.project,
        },
        notify: this.notify,
        owner: workerType.owner,
      });
      return false;
    }
    return true;
  }

  async configureServiceAccount({workerType}) {
    const accountName = `tcw-${workerType.name}`;
    const accountEmail = `${accountName}@${this.project}.iam.gserviceaccount.com`;
    const fullName = `projects/${this.project}/serviceAccounts/${accountEmail}`;
    return await this.readModifySet({
      workerType,
      key: 'service-account',

      read: async () => this.iam.projects.serviceAccounts.get({
        name: fullName,
      }),

      compare: current => current.description === workerType.description,

      modify: async current => {
        const updated = {
          ...current,
          description: workerType.description,
        };
        await this.iam.projects.serviceAccounts.patch({
          name: fullName,
          requestBody: {
            serviceAccount: updated,
            updateMask: 'description',
          },
        });
        return updated;
      },

      set: async () => {
        const account = await this.iam.projects.serviceAccounts.create({
          name: `projects/${this.project}`,
          accountId: accountName,
          requestBody: {
            serviceAccount: {
              displayName: `Taskcluster Worker Group: ${workerType.name}`,
              description: workerType.description,
            },
          },
        });
        await workerType.modify(wt => {
          wt.providerData.serviceAccountId = account.data.uniqueId;
        });
        // Now we grant ourlves the ability to create workertypes with this user
        await this.iam.projects.serviceAccounts.setIamPolicy({
          resource: `projects/${this.project}/serviceAccounts/${accountEmail}`,
          requestBody: {
            policy: {
              bindings: [{
                role: 'roles/iam.serviceAccountUser',
                members: [`serviceAccount:${this.ownClientEmail}`],
              }],
            },
          },
        });
        return account;
      },
    });
  }

  async configureRole({workerType}) {
    const roleId = `taskcluster.workertype.${workerType.name.replace(/-/g, '_')}`;
    const roleName =`projects/${this.project}/roles/${roleId}`;
    return await this.readModifySet({
      workerType,
      key: 'role',

      read: async () => this.iam.projects.roles.get({
        name: roleName,
      }),

      compare: current => {
        try {
          assert.deepEqual({
            includedPermissions: current.includedPermissions,
            description: current.description,
          }, {
            includedPermissions: this.instancePermissions,
            description: workerType.description,
          });
        } catch (err) {
          return false;
        }
        return true;
      },

      modify: async current => {
        const updated = {
          ...current,
          description: workerType.description,
          includedPermissions: this.instancePermissions,
        };
        await this.iam.projects.roles.patch({
          name: roleName,
          updateMask: 'description,includedPermissions',
          requestBody: updated,
        });
        return updated;
      },

      set: async () => this.iam.projects.roles.create({
        parent: `projects/${this.project}`,
        requestBody: {
          roleId,
          role: {
            title: `Taskcluster ${workerType.name} Worker Role`,
            description: workerType.description,
            includedPermissions: this.instancePermissions,
          },
        },
      }),
    });
  }

  async setupTemplate({workerType, accountEmail}) {
    // TODO: assert that workertype name matches [a-z]([-a-z0-9]*[a-z0-9])? for this provider
    const templateName = `${workerType.name}-${this.providerVersion}-${workerType.lastModified.getTime()}`;
    return await this.readModifySet({
      workerType,
      key: 'template',

      read: async () => this.compute.instanceTemplates.get({
        project: this.project,
        instanceTemplate: templateName,
      }),

      // These are immutable so if a value exists it is correct (also no need for modify here)
      compare: current => current.name === templateName,

      set: async () => {
        const operation = await this.compute.instanceTemplates.insert({
          project: this.project,
          requestId: uuid(),
          requestBody: {
            name: templateName,
            description: workerType.description,
            properties: {
              description: workerType.description,
              serviceAccounts: [{
                email: accountEmail,
                scopes: [
                  /*
                   * This looks scary but is ok. According to
                   * https://cloud.google.com/compute/docs/access/service-accounts#accesscopesiam
                   *
                   * "A best practice is to set the full cloud-platform
                   * access scope on the instance, then securely limit
                   * the service account's API access with IAM roles."
                   *
                   * Which is what we do.
                   */
                  'https://www.googleapis.com/auth/cloud-platform',
                ],
              }],
              machineType: workerType.config.machineType,
              metadata: {
                items: [
                  {
                    key: 'config',
                    value: JSON.stringify({
                      provisionerId: this.provisionerId,
                      workerType: workerType.name,
                      workerGroup: `${workerType.name}-${workerType.config.region}`,
                      credentialUrl: libUrls.api(this.rootUrl, 'worker-manager', 'v1', `credentials/google/${workerType.name}`),
                      rootUrl: this.rootUrl,
                      userData: workerType.config.userData,
                    }),
                  },
                ],
              },
              scheduling: workerType.config.scheduling,
              networkInterfaces: workerType.config.networkInterfaces,
              disks: workerType.config.disks,
              // We can add things like guestaccelerators and minCpuPlatform here if we want as well
            },
          },
        });
        // TODO: abstract this opertaion logic into a function and probably clean up all of the .data
        // differences in each of the get/set/etc. This all could do with a pass of abstraction I think.
        await workerType.modify(wt => {
          if (wt.providerData.trackedOperations) {
            wt.providerData.trackedOperations.push(operation.data);
          } else {
            wt.providerData.trackedOperations = [operation.data];
          }
        });
        // Do not cache this result, it is not a template but an operation
        // On the first iteration after the operation is completed,
        // the `read` above will pick up the created template.
        return {data: undefined};
      },
    });
  }

  // TODO: Make sure to set remaining knobs of groups
  // TODO: Who knows if modify actually makes sense here
  async setupInstanceGroup({workerType, template, targetSize}) {
    const templateId = template.selfLink;
    const resourceId = workerType.name;
    return await this.readModifySet({
      workerType,
      key: 'group',

      read: async () => this.compute.regionInstanceGroupManagers.get({
        project: this.project,
        region: workerType.config.region,
        instanceGroupManager: resourceId,
      }),

      compare: current => {
        if (current.region.endsWith(workerType.config.region)) {
          return false;
        }
        try {
          assert.deepEqual({
            description: current.description,
            instanceTemplate: current.instanceTemplate,
            baseInstanceName: current.baseInstanceName,
            targetSize: current.targetSize,
          }, {
            description: workerType.description,
            instanceTemplate: templateId,
            baseInstancename: workerType.name,
            targetSize,
          }, {
          });
        } catch (err) {
          return false;
        }
        return true;
      },

      modify: async current => {
        const operation = await this.compute.regionInstanceGroupManagers.patch({
          project: this.project,
          region: workerType.config.region,
          instanceGroupManager: resourceId,
          requestBody: {
            description: workerType.description,
            instanceTemplate: templateId,
            baseInstancename: workerType.name,
            targetSize,
          },
        });
        await workerType.modify(wt => {
          if (wt.providerData.trackedOperations) {
            wt.providerData.trackedOperations.push(operation.data);
          } else {
            wt.providerData.trackedOperations = [operation.data];
          }
        });
        return undefined; // This is an operation, do not cache
      },

      set: async () => {
        const operation = await this.compute.regionInstanceGroupManagers.insert({
          project: this.project,
          region: workerType.config.region,
          requestBody: {
            name: resourceId,
            description: workerType.description,
            instanceTemplate: templateId,
            baseInstancename: workerType.name,
            targetSize,
          },
        });
        await workerType.modify(wt => {
          if (wt.providerData.trackedOperations) {
            wt.providerData.trackedOperations.push(operation.data);
          } else {
            wt.providerData.trackedOperations = [operation.data];
          }
        });
        return {data: undefined}; // This is an operation, do not cache
      },
    });
  }

  /**
   * It is important that with the current design we only check on errors
   * for error reporting. We should not use it to gate further progress of
   * provisioning due to the fact that we might not succeed in recording
   * the operation when it actually suceeded.
   */
  async handleOperations({workerType}) {
    if (!workerType.providerData.trackedOperations) {
      return;
    }
    const ongoing = [];
    for (const op of workerType.providerData.trackedOperations) {
      let operation;
      let getOp;
      let deleteOp;
      if (op.region) {
        const args = {
          project: this.project,
          region: op.region.split('/').slice(-1)[0],
          operation: op.name,
        };
        getOp = async () => this.compute.regionOperations.get(args);
        deleteOp = async () => this.compute.regionOperations.delete(args);
      } else {
        const args = {
          project: this.project,
          operation: op.name,
        };
        getOp = async () => this.compute.globalOperations.get(args);
        deleteOp = async () => this.compute.globalOperations.delete(args);
      }

      try {
        operation = (await getOp()).data;
      } catch (err) {
        if (err.code !== 404) {
          throw err;
        }
        // If the operation is no longer existing, nothing for us to do
        continue;
      }

      // Let's check back in on the next provisioning iteration if unfinished
      if (operation.status !== 'DONE') {
        ongoing.push(operation);
        continue;
      }

      if (operation.error) {
        for (const err of operation.error.errors) { // Each operation can have multiple errors
          await workerType.reportError({
            type: 'operation-error',
            title: 'Operation Error',
            description: err.message, // TODO: Make sure we clear exposing this with security folks
            extra: {
              code: err.code,
            },
            notify: this.notify,
            owner: workerType.owner,
          });
        }
      }
      await deleteOp();
    }

    await workerType.modify(wt => {
      wt.providerData.trackedOperations = ongoing;
    });
  }

  /*
   * A useful wrapper for interacting with resources
   * that google wants you to use read-modify-set semantics with
   * Example: https://cloud.google.com/iam/docs/creating-custom-roles#read-modify-write
   */
  async readModifySet({
    workerType,
    key,
    compare,
    read,
    modify,
    set,
  }) {
    let resource;

    key = `${workerType.name}.last-seen.${key}`;
    const lastSeen = this.cache.get(key);

    // If this is unchanged from last time, just
    // return it.
    if (lastSeen && compare(lastSeen)) {
      return lastSeen;
    }

    try {
      // First try to get the resource
      let res = await read();
      resource = res.data;

      // If the value in google is different
      // from the one we want it to be, we try to update it
      if (!compare(resource)) {
        res = await modify(resource);
        resource = res;
      }
    } catch (err) {
      if (err.code !== 404) {
        throw err;
      }
      // If the resource was never there in the first place, create it
      const res = await set();
      resource = res.data;
    }
    this.cache.set(key, resource);
    return resource;
  }

}

module.exports = {
  GoogleProvider,
};
