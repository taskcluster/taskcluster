const assert = require('assert');
const slugid = require('slugid');
const _ = require('lodash');
const taskcluster = require('taskcluster-client');
const uuid = require('uuid');
const {google} = require('googleapis');
const {ApiError, Provider} = require('./provider');
const {default: PQueue} = require('p-queue');

class GoogleProvider extends Provider {

  constructor({
    providerConfig,
    fakeCloudApis,
    ...conf
  }) {
    super(conf);
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
    this.queues = {};
    this._backoffDelay = _backoffDelay;
    for (const type of ['query', 'get', 'list', 'opRead']) {
      const {interval, intervalCap} = (apiRateLimits[type] || {});
      this.queues[type] = new PQueue({
        interval: interval || 100 * 1000, // Intervals are enforced every 100 seconds
        intervalCap: intervalCap || 2000, // The calls we make are all limited 20/sec so 20 * 100 are allowed
      });
    }

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

  async _enqueue(type, func, tries = 0) {
    const queue = this.queues[type];
    if (!queue) {
      throw new Error(`Unknown p-queue attempted: ${type}`);
    }
    try {
      return await queue.add(func, {priority: tries});
    } catch (err) {
      let backoff = this._backoffDelay;
      let level = 'notice';
      let reason = 'unknown';
      if (err.code === 403) { // google hands out 403 for rate limiting; back off significantly
        // google's interval is 100 seconds so let's try once optimistically and a second time to get it for sure
        backoff *= 50;
        reason = 'rateLimit';
      } else if (err.code === 403 || err.code >= 500) { // For 500s, let's take a shorter backoff
        backoff *= Math.pow(2, tries); // Longest backoff here is half a minute
        level = 'warning';
        reason = 'errors';
      } else {
        // If we don't want to do anything special here, just throw and let the
        // calling code figure out what to do
        throw err;
      }

      if (!queue.isPaused) {
        this.monitor.log.cloudApiPaused({
          providerId: this.providerId,
          queueName: type,
          reason,
          queueSize: queue.size,
          duration: backoff,
        }, {level});
        queue.pause();
        setTimeout(() => {
          this.monitor.log.cloudApiResumed({
            providerId: this.providerId,
            queueName: type,
          });
          queue.start();
        }, backoff);
      }

      if (tries > 4) {
        throw err;
      }

      return await this._enqueue(type, func, tries + 1);
    }
  }

  async setup() {
    const workerServiceAccount = (await this.iam.projects.serviceAccounts.get({
      name: `projects/${this.project}/serviceAccounts/${this.workerServiceAccountId}`,
    })).data;
    this.workerServiceAccountEmail = workerServiceAccount.email;
  }

  async registerWorker({worker, workerPool, workerIdentityProof}) {
    const {token} = workerIdentityProof;

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

    await worker.modify(w => {
      w.state = this.Worker.states.RUNNING;
    });

    // assume for the moment that workers self-terminate before 96 hours
    return {expires: taskcluster.fromNow('96 hours')};
  }

  async deprovision({workerPool}) {
    // nothing to do: we just wait for workers to terminate themselves
  }

  async removeResources({workerPool}) {
    // remove any remaining providerData when we are no longer responsible for this workerPool
    await workerPool.modify(wt => {
      delete wt.providerData[this.providerId];
    });
  }

  async removeWorker({worker}) {
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

  async provision({workerPool}) {
    const {workerPoolId} = workerPool;

    if (!workerPool.providerData[this.providerId] || workerPool.providerData[this.providerId].running === undefined) {
      await workerPool.modify(wt => {
        wt.providerData[this.providerId] = wt.providerData[this.providerId] || {};
        wt.providerData[this.providerId].running = wt.providerData[this.providerId].running || 0;
      });
    }

    const toSpawn = await this.estimator.simple({
      workerPoolId,
      ...workerPool.config,
      runningCapacity: workerPool.providerData[this.providerId].running,
    });

    await Promise.all(new Array(toSpawn).fill(null).map(async i => {
      // This must be unique to currently existing instances and match [a-z]([-a-z0-9]*[a-z0-9])?
      // The lost entropy from downcasing, etc should be ok due to the fact that
      // only running instances need not be identical. We do not use this name to identify
      // workers in taskcluster.
      const poolName = workerPoolId.replace(/\//g, '-').slice(0, 38);
      const instanceName = `${poolName}-${slugid.nice().replace(/_/g, '-').toLowerCase()}`;

      const cfg = _.sample(workerPool.config.launchConfigs);

      let op;

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
              'managed-by': 'taskcluster',
              'worker-pool-id': workerPoolId.replace('/', '_').toLowerCase(),
            },
            description: cfg.description || workerPool.description,
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
                    workerGroup: this.providerId,
                    rootUrl: this.rootUrl,
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
          await workerPool.reportError({
            kind: 'creation-error',
            title: 'Instance Creation Error',
            description: error.message,
          });
        }
        return;
      }

      await this.Worker.create({
        workerPoolId,
        providerId: this.providerId,
        workerGroup: this.providerId,
        workerId: op.targetId,
        created: new Date(),
        expires: taskcluster.fromNow('1 week'),
        state: this.Worker.states.REQUESTED,
        providerData: {
          project: this.project,
          zone: cfg.zone,
          operation: {
            name: op.name,
            zone: op.zone,
          },
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

    try {
      const {data} = await this._enqueue('get', () => this.compute.instances.get({
        project: worker.providerData.project,
        zone: worker.providerData.zone,
        instance: worker.workerId,
      }));
      const {status} = data;
      if (['PROVISIONING', 'STAGING', 'RUNNING'].includes(status)) {
        this.seen[worker.workerPoolId] += 1;

        // If the worker will be expired soon but it still exists,
        // update it to stick around a while longer. If this doesn't happen,
        // long-lived instances become orphaned from the provider. We don't update
        // this on every loop just to avoid the extra work when not needed
        if (worker.expires < taskcluster.fromNow('1 day')) {
          await worker.modify(w => {
            w.expires = taskcluster.fromNow('1 week');
          });
        }
      } else if (['TERMINATED', 'STOPPED'].includes(status)) {
        await this._enqueue('query', () => this.compute.instances.delete({
          project: worker.providerData.project,
          zone: worker.providerData.zone,
          instance: worker.workerId,
        }));
        await worker.modify(w => {
          w.state = states.STOPPED;
        });
      }
    } catch (err) {
      if (err.code !== 404) {
        throw err;
      }
      if (worker.providerData.operation) {
        // We only check in on the operation if the worker failed to
        // start succesfully
        await this.handleOperation({
          op: worker.providerData.operation,
          errors: this.errors[worker.workerPoolId],
        });
      }
      await worker.modify(w => {
        w.state = states.STOPPED;
      });
    }
  }

  /*
   * Called after an iteration of the worker scanner
   */
  async scanCleanup() {
    await Promise.all(Object.entries(this.seen).map(async ([workerPoolId, seen]) => {
      const workerPool = await this.WorkerPool.load({
        workerPoolId,
      }, true);

      if (!workerPool) {
        return; // In this case, the workertype has been deleted so we can just move on
      }

      if (this.errors[workerPoolId].length) {
        await Promise.all(this.errors[workerPoolId].map(error => workerPool.reportError(error)));
      }

      await workerPool.modify(wt => {
        if (!wt.providerData[this.providerId]) {
          wt.providerData[this.providerId] = {};
        }
        wt.providerData[this.providerId].running = seen;
      });
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
  async handleOperation({op, errors}) {
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
