const assert = require('assert');
const slugid = require('slugid');
const _ = require('lodash');
const taskcluster = require('taskcluster-client');
const uuid = require('uuid');
const {google} = require('googleapis');
const {ApiError, Provider} = require('./provider');
const {CloudAPI} = require('./cloudapi');
const {WorkerPool} = require('../data');

class GoogleProvider extends Provider {

  constructor({
    providerConfig,
    fakeCloudApis,
    ...conf
  }) {
    super({providerConfig, ...conf});
    let {project, creds, workerServiceAccountId, apiRateLimits = {}, _backoffDelay = 1000} = providerConfig;
    this.configSchema = 'config-google';

    assert(project, 'Must provide a project to google providers');
    assert(creds, 'Must provide creds to google providers');
    assert(workerServiceAccountId, 'Must provide a workerServiceAccountId to google providers');

    this.project = project;
    this.zonesByRegion = {};
    this.workerServiceAccountId = workerServiceAccountId;

    // There are different rate limits per type of request
    // as documented here: https://cloud.google.com/compute/docs/api-rate-limits
    const cloud = new CloudAPI({
      types: ['query', 'get', 'list', 'opRead'],
      apiRateLimits,
      intervalDefault: 100 * 1000, // Intervals are enforced every 100 seconds
      intervalCapDefault: 2000, // The calls we make are all limited 20/sec so 20 * 100 are allowed
      monitor: this.monitor,
      providerId: this.providerId,
      errorHandler: ({err, tries}) => {
        if (err.code === 403) { // google hands out 403 for rate limiting; back off significantly
          // google's interval is 100 seconds so let's try once optimistically and a second time to get it for sure
          return {backoff: _backoffDelay * 50, reason: 'rateLimit', level: 'notice'};
        } else if (err.code === 403 || err.code >= 500) { // For 500s, let's take a shorter backoff
          return {backoff: _backoffDelay * Math.pow(2, tries), reason: 'errors', level: 'warning'};
        }
        // If we don't want to do anything special here, just throw and let the
        // calling code figure out what to do
        throw err;
      },
    });
    this._enqueue = cloud.enqueue.bind(cloud);

    if (fakeCloudApis && fakeCloudApis.google) {
      this.ownClientEmail = 'whatever@example.com';
      this.compute = fakeCloudApis.google.compute();
      this.iam = fakeCloudApis.google.iam();
      this.oauth2 = new fakeCloudApis.google.OAuth2({project});
      return;
    }

    // If creds are a string or a base64d string, parse them
    if (_.isString(creds)) {
      try {
        creds = JSON.parse(creds);
      } catch (err) {
        if (err.name !== 'SyntaxError') {
          throw err;
        }
        creds = JSON.parse(Buffer.from(creds, 'base64'));
      }
    }

    this.ownClientEmail = creds.client_email;
    const client = google.auth.fromJSON(creds);
    client.scopes = [
      'https://www.googleapis.com/auth/compute', // For configuring instance templates, groups, etc
      'https://www.googleapis.com/auth/iam', // For fetching service account name
    ];
    this.compute = google.compute({
      version: 'v1',
      auth: client,
    });
    this.iam = google.iam({
      version: 'v1',
      auth: client,
    });
    this.oauth2 = new google.auth.OAuth2();
  }

  async setup() {
    const workerServiceAccount = (await this.iam.projects.serviceAccounts.get({
      name: `projects/${this.project}/serviceAccounts/${this.workerServiceAccountId}`,
    })).data;
    this.workerServiceAccountEmail = workerServiceAccount.email;
  }

  async registerWorker({worker, workerPool, workerIdentityProof}) {
    const {token} = workerIdentityProof;
    const monitor = this.workerMonitor({worker});

    // use the same message for all errors here, so as not to give an attacker
    // extra information.
    const error = () => new ApiError('Token validation error');

    if (!token) {
      throw error();
    }

    // This will throw an error if the token is invalid at all
    let payload;
    try {
      const res = await this.oauth2.verifyIdToken({
        idToken: token,
        audience: this.rootUrl,
      });
      payload = res.payload;
    } catch (err) {
      // log the error message in case this is an issue with GCP, rather than an
      // invalid token.  In such a case, there should be many such log messages!
      this.monitor.warning('Error validating GCP OAuth2 token', {error: err.toString()});
      throw error();
    }
    const dat = payload.google.compute_engine;

    // First check to see if the request is coming from the project this provider manages
    if (dat.project_id !== this.project) {
      throw error();
    }

    // Now check to make sure that the serviceAccount that the worker has is the
    // serviceAccount that we have configured that worker to use. Nobody else in the project
    // should have permissions to create instances with this serviceAccount.
    if (payload.sub !== this.workerServiceAccountId) {
      throw error();
    }

    // Google docs say instance id is globally unique even across projects
    if (worker.workerId !== dat.instance_id) {
      throw error();
    }

    if (worker.state !== this.Worker.states.REQUESTED) {
      throw error();
    }

    let expires = taskcluster.fromNow('96 hours');
    if (worker.providerData.reregistrationTimeout) {
      expires = new Date(Date.now() + worker.providerData.reregistrationTimeout);
    }

    this.monitor.log.workerRunning({
      workerPoolId: workerPool.workerPoolId,
      providerId: this.providerId,
      workerId: worker.workerId,
    });
    monitor.debug('setting state to RUNNING');
    await worker.modify(w => {
      w.lastModified = new Date();
      w.state = this.Worker.states.RUNNING;
      w.providerData.terminateAfter = expires.getTime();
    });

    // assume for the moment that workers self-terminate before 96 hours
    const workerConfig = worker.providerData.workerConfig || {};
    return {expires, workerConfig};
  }

  async deprovision({workerPool}) {
    // nothing to do: we just wait for workers to terminate themselves
  }

  async removeResources({workerPool}) {
  }

  async removeWorker({worker, reason}) {
    this.monitor.log.workerRemoved({
      workerPoolId: worker.workerPoolId,
      providerId: worker.providerId,
      workerId: worker.workerId,
      reason,
    });

    try {
      // This returns an operation that we could track but the chances
      // that this fails due to user input being wrong are low so
      // we'll ignore it in order to save a bunch of traffic checking up on these
      // operations when many instances are terminated at once
      await this._enqueue('query', () => this.compute.instances.delete({
        project: this.project,
        zone: worker.providerData.zone,
        instance: worker.workerId,
      }));
    } catch (err) {
      if (err.code === 404) {
        return; // Nothing to do, it is already gone
      }
      throw err;
    }
  }

  async provision({workerPool, workerInfo}) {
    const {workerPoolId} = workerPool;

    if (!workerPool.providerData[this.providerId]) {
      await this.db.fns.update_worker_pool_provider_data(
        workerPool.workerPoolId, this.providerId, {});
    }

    let toSpawn = await this.estimator.simple({
      workerPoolId,
      ...workerPool.config,
      workerInfo,
    });

    if (toSpawn === 0) {
      return; // Nothing to do
    }

    const {terminateAfter, reregistrationTimeout} = Provider.interpretLifecycle(workerPool.config);

    const cfgs = [];
    while (toSpawn > 0) {
      const cfg = _.sample(workerPool.config.launchConfigs);
      cfgs.push(cfg);
      toSpawn -= cfg.capacityPerInstance;
    }

    await Promise.all(cfgs.map(async cfg => {
      // This must be unique to currently existing instances and match [a-z]([-a-z0-9]*[a-z0-9])?
      // The lost entropy from downcasing, etc should be ok due to the fact that
      // only running instances need not be identical. We do not use this name to identify
      // workers in taskcluster.
      const poolName = workerPoolId.replace(/[\/_]/g, '-').slice(0, 38);
      const instanceName = `${poolName}-${slugid.nice().replace(/_/g, '-').toLowerCase()}`;
      const workerGroup = cfg.region;
      const labels = {
        'created-by': `taskcluster-wm-${this.providerId}`.replace(/[^a-zA-Z0-9-]/g, '-'),
        'managed-by': 'taskcluster',
        'worker-pool-id': workerPoolId.replace(/[^a-zA-Z0-9-]/g, '-').toLowerCase(),
        'owner': workerPool.owner.replace(/[^a-zA-Z0-9-]/g, '-').toLowerCase(),
      };
      let op;

      const disks = [
        ...cfg.disks || {},
      ];
      for (let disk of disks) {
        disk.labels = {...disk.labels, ...labels};
      }

      try {
        const res = await this._enqueue('query', () => this.compute.instances.insert({
          project: this.project,
          zone: cfg.zone,
          requestId: uuid.v4(), // This is just for idempotency
          requestBody: {
            ...cfg, // We spread this in first so that users can't override stuff we set below
            name: instanceName,
            labels: {
              ...cfg.labels || {},
              ...labels,
            },
            description: cfg.description || workerPool.description,
            disks,
            serviceAccounts: [{
              email: this.workerServiceAccountEmail,
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
            scheduling: {
              ...cfg.scheduling || {},
              automaticRestart: false,
            },
            metadata: {
              items: [
                ...(cfg.metadata || {}).items || [],
                {
                  key: 'taskcluster',
                  value: JSON.stringify({
                    workerPoolId,
                    providerId: this.providerId,
                    workerGroup,
                    rootUrl: this.rootUrl,
                    // NOTE: workerConfig is deprecated and isn't used after worker-runner v29.0.1
                    workerConfig: cfg.workerConfig || {},
                  }),
                },
              ],
            },
          },
        }));
        op = res.data;
      } catch (err) {
        if (!err.errors) {
          throw err;
        }
        for (const error of err.errors) {
          await this.reportError({
            workerPool,
            kind: 'creation-error',
            title: 'Instance Creation Error',
            description: error.message,
          });
        }
        return;
      }

      this.monitor.log.workerRequested({
        workerPoolId,
        providerId: this.providerId,
        workerGroup,
        workerId: op.targetId,
      });
      const now = new Date();
      await this.Worker.create({
        workerPoolId,
        providerId: this.providerId,
        workerGroup,
        workerId: op.targetId,
        created: now,
        lastModified: now,
        lastChecked: now,
        expires: taskcluster.fromNow('1 week'),
        state: this.Worker.states.REQUESTED,
        capacity: cfg.capacityPerInstance,
        providerData: {
          project: this.project,
          zone: cfg.zone,
          operation: {
            name: op.name,
            zone: op.zone,
          },
          terminateAfter,
          reregistrationTimeout, // Record this for later reregistrations so that we can recalculate deadline
          workerConfig: cfg.workerConfig || {},
        },
      });
    }));
  }

  /*
   * Called before an iteration of the worker scanner
   */
  async scanPrepare() {
    this.seen = {};
    this.errors = {};
  }

  /*
   * Called for every worker on a schedule so that we can update the state of
   * the worker locally
   */
  async checkWorker({worker}) {
    const states = this.Worker.states;
    this.seen[worker.workerPoolId] = this.seen[worker.workerPoolId] || 0;
    this.errors[worker.workerPoolId] = this.errors[worker.workerPoolId] || [];

    const monitor = this.workerMonitor({worker});

    let state = worker.state;
    try {
      const {data} = await this._enqueue('get', () => this.compute.instances.get({
        project: worker.providerData.project,
        zone: worker.providerData.zone,
        instance: worker.workerId,
      }));
      const {status} = data;
      monitor.debug(`instance status is ${status}`);
      if (['PROVISIONING', 'STAGING', 'RUNNING'].includes(status)) {
        this.seen[worker.workerPoolId] += worker.capacity || 1;

        // If the worker will be expired soon but it still exists,
        // update it to stick around a while longer. If this doesn't happen,
        // long-lived instances become orphaned from the provider. We don't update
        // this on every loop just to avoid the extra work when not needed
        if (worker.expires < taskcluster.fromNow('1 day')) {
          await worker.modify(w => {
            w.expires = taskcluster.fromNow('1 week');
          });
        }
        if (worker.providerData.terminateAfter && worker.providerData.terminateAfter < Date.now()) {
          await this.removeWorker({worker, reason: 'terminateAfter time exceeded'});
        }
      } else if (['TERMINATED', 'STOPPED'].includes(status)) {
        await this._enqueue('query', () => this.compute.instances.delete({
          project: worker.providerData.project,
          zone: worker.providerData.zone,
          instance: worker.workerId,
        }));
        this.monitor.log.workerStopped({
          workerPoolId: worker.workerPoolId,
          providerId: this.providerId,
          workerId: worker.workerId,
        });
        state = states.STOPPED;
      }
    } catch (err) {
      if (err.code !== 404) {
        throw err;
      }
      monitor.debug(`instance status not found`);
      if (worker.providerData.operation) {
        // We only check in on the operation if the worker failed to
        // start succesfully
        await this.handleOperation({
          op: worker.providerData.operation,
          errors: this.errors[worker.workerPoolId],
          monitor,
        });
      }
      this.monitor.log.workerStopped({
        workerPoolId: worker.workerPoolId,
        providerId: this.providerId,
        workerId: worker.workerId,
      });
      state = states.STOPPED;
    }
    monitor.debug(`setting state to ${state}`);
    await worker.modify(w => {
      const now = new Date();
      if (w.state !== state) {
        w.lastModified = now;
      }
      w.lastChecked = now;
      w.state = state;
    });
  }

  /*
   * Called after an iteration of the worker scanner
   */
  async scanCleanup() {
    this.monitor.log.scanSeen({providerId: this.providerId, seen: this.seen});
    await Promise.all(Object.entries(this.seen).map(async ([workerPoolId, seen]) => {
      const workerPool = await WorkerPool.get(this.db, workerPoolId);
      if (!workerPool) {
        return; // In this case, the workertype has been deleted so we can just move on
      }

      if (this.errors[workerPoolId].length) {
        await Promise.all(this.errors[workerPoolId].map(error => this.reportError({workerPool, ...error})));
      }
    }));
  }

  /**
   * Used to check in on the state of any operations
   * that are ongoing. This should not be used to gate
   * any other actions in the provider as we may fail to write these
   * operations when we create them. This is just a nice-to-have for
   * reporting configuration/provisioning errors to the users.
   *
   * op: an object with keys `name` and optionally `region` or `zone` if it is a region or zone based operation
   * errors: a list that will have any errors found for that operation appended to it
   */
  async handleOperation({op, errors, monitor}) {
    let operation;
    let opService;
    const args = {
      project: this.project,
      operation: op.name,
    };
    if (op.region) {
      args.region = op.region.split('/').slice(-1)[0];
      opService = this.compute.regionOperations;
    } else if (op.zone) {
      args.zone = op.zone.split('/').slice(-1)[0];
      opService = this.compute.zoneOperations;
    } else {
      opService = this.compute.globalOperations;
    }

    try {
      operation = (await this._enqueue('opRead', () => opService.get(args))).data;
    } catch (err) {
      if (err.code !== 404) {
        throw err;
      }
      // If the operation is no longer existing, nothing for us to do
      return false;
    }

    // Let's check back in on the next provisioning iteration if unfinished
    if (operation.status !== 'DONE') {
      monitor.debug(`operation status ${operation.status} is not DONE`);
      return true;
    }

    if (operation.error) {
      for (const err of operation.error.errors) { // Each operation can have multiple errors
        errors.push({
          kind: 'operation-error',
          title: 'Operation Error',
          description: err.message,
          extra: {
            code: err.code,
          },
          notify: this.notify,
          WorkerPoolError: this.WorkerPoolError,
        });
      }
    }
    return false;
  }
}

module.exports = {
  GoogleProvider,
};
