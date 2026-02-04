import assert from 'assert';
import slugid from 'slugid';
import _ from 'lodash';
import taskcluster from '@taskcluster/client';
import * as uuid from 'uuid';
import gcpCompute from '@googleapis/compute';
import gcpIam from '@googleapis/iam';
import { ApiError, Provider } from './provider.js';
import { CloudAPI } from './cloudapi.js';
import { WorkerPool, Worker } from '../data.js';

/** @typedef {import('../data.js').WorkerPoolStats} WorkerPoolStats */

export class GoogleProvider extends Provider {

  constructor({
    providerConfig,
    ...conf
  }) {
    super({ providerConfig, ...conf });
    let { project, creds, workerServiceAccountId, apiRateLimits = {}, _backoffDelay = 1000 } = providerConfig;
    this.configSchema = 'config-google';

    assert(project, 'Must provide a project to google providers');
    assert(creds, 'Must provide creds to google providers');
    assert(workerServiceAccountId, 'Must provide a workerServiceAccountId to google providers');

    this.project = project;
    this.zonesByRegion = {};
    this.workerServiceAccountId = workerServiceAccountId;

    // There are different rate limits per type of request
    // as documented here: https://cloud.google.com/compute/docs/api-rate-limits
    this.cloudApi = new CloudAPI({
      types: ['query', 'get', 'list', 'opRead'],
      apiRateLimits,
      intervalDefault: 100 * 1000, // Intervals are enforced every 100 seconds
      intervalCapDefault: 2000, // The calls we make are all limited 20/sec so 20 * 100 are allowed
      timeout: 10 * 60 * 1000, // each cloud call should not take longer than 10 minutes
      throwOnTimeout: true,
      monitor: this.monitor,
      providerId: this.providerId,
      errorHandler: ({ err, tries }) => {
        if (err.code === 403) { // google hands out 403 for rate limiting; back off significantly
          // google's interval is 100 seconds so let's try once optimistically and a second time to get it for sure
          return { backoff: _backoffDelay * 50, reason: 'rateLimit', level: 'notice' };
        } else if (err.code === 403 || err.code >= 500) { // For 500s, let's take a shorter backoff
          return { backoff: _backoffDelay * Math.pow(2, tries), reason: 'errors', level: 'warning' };
        }
        // If we don't want to do anything special here, just throw and let the
        // calling code figure out what to do
        throw err;
      },
      collectMetrics: true,
    });
    this._enqueue = this.cloudApi.enqueue.bind(this.cloudApi);

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
    const client = gcpCompute.auth.fromJSON(creds);
    client.scopes = [
      'https://www.googleapis.com/auth/compute', // For configuring instance templates, groups, etc
      'https://www.googleapis.com/auth/iam', // For fetching service account name
    ];
    this.compute = gcpCompute.compute({
      version: 'v1',
      auth: client,
    });
    this.iam = gcpIam.iam({
      version: 'v1',
      auth: client,
    });
    this.oauth2 = new gcpCompute.auth.OAuth2();
  }

  #extractGoogleApiErrors(err) {
    if (err.response?.data?.error?.errors && Array.isArray(err.response.data.error.errors)) {
      return err.response.data.error.errors;
    }
    if (err.errors && Array.isArray(err.errors)) {
      return err.errors;
    }
    if (err.response?.data?.error?.message) {
      return [{
        message: err.response.data.error.message,
        code: err.response.data.error.code,
      }];
    }
    return null;
  }

  async setup() {
    const workerServiceAccount = (await this.iam.projects.serviceAccounts.get({
      name: `projects/${this.project}/serviceAccounts/${this.workerServiceAccountId}`,
    })).data;
    this.workerServiceAccountEmail = workerServiceAccount.email;
  }

  async registerWorker({ worker, workerPool, workerIdentityProof }) {
    const { token } = workerIdentityProof;
    const monitor = this.workerMonitor({ worker });

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
      this.monitor.warning('Error validating GCP OAuth2 token', { error: err.toString() });
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

    if (worker.state !== Worker.states.REQUESTED) {
      throw error();
    }

    let expires = taskcluster.fromNow('96 hours');
    if (worker.providerData.reregistrationTimeout) {
      expires = new Date(Date.now() + worker.providerData.reregistrationTimeout);
    }

    monitor.debug('setting state to RUNNING');
    await worker.update(this.db, worker => {
      worker.state = Worker.states.RUNNING;
      worker.providerData.terminateAfter = expires.getTime();
      worker.lastModified = new Date();
    });
    await this.onWorkerRunning({ worker });

    // assume for the moment that workers self-terminate before 96 hours
    const workerConfig = worker.providerData.workerConfig || {};
    return {
      expires,
      workerConfig,
    };
  }

  async deprovision({ workerPool }) {
    // nothing to do: we just wait for workers to terminate themselves
  }

  async removeWorker({ worker, reason }) {
    // trigger event before saving worker state
    await this.onWorkerRemoved({ worker, reason });
    await worker.update(this.db, w => {
      if ([Worker.states.REQUESTED, Worker.states.RUNNING].includes(w.state)) {
        w.lastModified = new Date();
        w.state = Worker.states.STOPPING;
      }
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

  /**
   * @param {{ workerPool: WorkerPool, workerPoolStats: WorkerPoolStats }} opts
   */
  async provision({ workerPool, workerPoolStats }) {
    const { workerPoolId } = workerPool;
    const workerInfo = workerPoolStats?.forProvision() ?? {};

    if (!workerPool.providerData[this.providerId]) {
      await this.db.fns.update_worker_pool_provider_data(
        workerPool.workerPoolId, this.providerId, {});
    }

    let toSpawn = await this.estimator.simple({
      workerPoolId,
      providerId: this.providerId,
      ...workerPool.config,
      workerInfo,
    });

    if (toSpawn === 0 || workerPool.config?.launchConfigs?.length === 0) {
      return; // Nothing to do
    }

    const {
      terminateAfter, reregistrationTimeout, queueInactivityTimeout,
    } = Provider.interpretLifecycle(workerPool.config);

    const cfgs = await this.selectLaunchConfigsForSpawn({ workerPool, toSpawn, workerPoolStats });

    await Promise.all(cfgs.map(async launchConfig => {
      const cfg = launchConfig.configuration;

      // This must be unique to currently existing instances and match [a-z]([-a-z0-9]*[a-z0-9])?
      // The lost entropy from downcasing, etc should be ok due to the fact that
      // only running instances need not be identical. We do not use this name to identify
      // workers in taskcluster.
      const poolName = workerPoolId.replace(/[\/_]/g, '-').slice(0, 38);
      const instanceName = `${poolName}-${slugid.nice().replace(/_/g, '-').toLowerCase()}`;
      // Historically we set workerGroup to cfg.region (e.g. 'us-east1') but
      // cfg.zone (e.g. 'us-east1-d') is more specific, and required for e.g.
      // terminating instances with:
      //   `gcloud compute instances delete <workerId> --zone=<workerGroup>`
      const workerGroup = cfg.zone;
      const labels = {
        'created-by': `taskcluster-wm-${this.providerId}`.replace(/[^a-zA-Z0-9-]/g, '-'),
        'managed-by': 'taskcluster',
        'worker-pool-id': workerPoolId.replace(/[^a-zA-Z0-9-]/g, '-').toLowerCase(),
        'owner': workerPool.owner.replace(/[^a-zA-Z0-9-]/g, '-').toLowerCase(),
        'launch-config-id': launchConfig.launchConfigId,
      };
      let op;

      const disks = [
        ...(cfg.disks || {}),
      ];
      for (let disk of disks) {
        if (disk.type !== 'PERSISTENT') {
          delete disk.labels;
          continue;
        }
        const initializeParams = disk.initializeParams || {};
        disk.initializeParams = {
          ...initializeParams,
          labels: {
            ...initializeParams.labels,
            ...disk.labels,
            ...labels,
          },
        };
        delete disk.labels;
      }

      try {
        const res = await this._enqueue('query', () => this.compute.instances.insert({
          project: this.project,
          zone: cfg.zone,
          requestId: uuid.v4(), // This is just for idempotency
          requestBody: {
            ..._.omit(cfg, ['region', 'zone', 'workerConfig', 'workerManager', 'capacityPerInstance']),
            name: instanceName,
            labels: {
              ...(cfg.labels || {}),
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
              ...(cfg.scheduling || {}),
              automaticRestart: false,
            },
            metadata: {
              items: [
                ...((cfg.metadata || {}).items || []),
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
        const errors = this.#extractGoogleApiErrors(err);
        if (!errors) {
          throw err;
        }
        for (const error of errors) {
          await this.reportError({
            workerPool,
            kind: 'creation-error',
            title: 'Instance Creation Error',
            description: error.message,
            extra: {
              config: cfg,
              errorCode: error.code,
            },
            launchConfigId: launchConfig.launchConfigId,
          });
        }
        return;
      }

      const worker = Worker.fromApi({
        workerPoolId,
        providerId: this.providerId,
        workerGroup,
        workerId: op.targetId,
        expires: taskcluster.fromNow('1 week'),
        state: Worker.states.REQUESTED,
        capacity: cfg?.workerManager?.capacityPerInstance ?? cfg.capacityPerInstance ?? 1,
        providerData: {
          project: this.project,
          zone: cfg.zone,
          operation: {
            name: op.name,
            zone: op.zone,
          },
          terminateAfter,
          reregistrationTimeout, // Record this for later reregistrations so that we can recalculate deadline
          queueInactivityTimeout,
          workerConfig: cfg.workerConfig || {},
        },
        launchConfigId: launchConfig.launchConfigId,
      });
      await worker.create(this.db);
      await this.onWorkerRequested({ worker, terminateAfter });
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
  async checkWorker({ worker }) {
    const states = Worker.states;
    this.seen[worker.workerPoolId] = this.seen[worker.workerPoolId] || 0;
    this.errors[worker.workerPoolId] = this.errors[worker.workerPoolId] || [];

    const monitor = this.workerMonitor({ worker });

    let state;
    try {
      const { data } = await this._enqueue('get', () => this.compute.instances.get({
        project: worker.providerData.project,
        zone: worker.providerData.zone,
        instance: worker.workerId,
      }));
      const { status } = data;
      monitor.debug(`instance status is ${status}`);
      if (['PROVISIONING', 'STAGING', 'RUNNING'].includes(status)) {
        this.seen[worker.workerPoolId] += worker.capacity || 1;

        if (worker.providerData.terminateAfter && worker.providerData.terminateAfter < Date.now()) {
          // reload the worker to make sure we have the latest data
          await worker.reload(this.db);
          if (worker.providerData.terminateAfter < Date.now()) {
            await this.removeWorker({ worker, reason: 'terminateAfter time exceeded' });
          }
        }
        const { isZombie, reason } = Provider.isZombie({ worker });
        if (isZombie) {
          await this.removeWorker({ worker, reason });
        }
      } else if (['TERMINATED', 'STOPPED'].includes(status)) {
        await this._enqueue('query', () => this.compute.instances.delete({
          project: worker.providerData.project,
          zone: worker.providerData.zone,
          instance: worker.workerId,
        }));
        state = states.STOPPED;
      }
    } catch (err) {
      if (err.code !== 404) {
        throw err;
      }
      monitor.debug(`instance status not found`);
      if (worker.providerData.operation) {
        // We only check in on the operation if the worker failed to
        // start successfully
        if (await this.handleOperation({
          op: worker.providerData.operation,
          errors: this.errors[worker.workerPoolId],
          monitor,
          worker,
        })) {
          monitor.debug('operation still running');
          // return to poll the operation again..
          return;
        }
      }
      state = states.STOPPED;
    }
    monitor.debug(`setting state to ${state}`);
    const now = new Date();
    if (state === states.STOPPED) {
      // trigger before changing worker.state
      await this.onWorkerStopped({ worker });
    }
    await worker.update(this.db, worker => {
      if (state !== undefined) {
        worker.state = state;
        worker.lastModified = now;
      }
      worker.lastChecked = now;
    });
  }

  /**
   * Called after an iteration of the worker scanner
   */
  async scanCleanup() {
    this.monitor.log.scanSeen({
      providerId: this.providerId,
      seen: this.seen,
      total: Provider.calcSeenTotal(this.seen),
    });
    this.cloudApi?.logAndResetMetrics();
    await Promise.all(Object.entries(this.seen).map(async ([workerPoolId, seen]) => {
      const workerPool = await WorkerPool.get(this.db, workerPoolId);
      if (!workerPool) {
        return; // In this case, the workertype has been deleted so we can just move on
      }

      this.monitor.metric.scanSeen(seen, {
        providerId: this.providerId,
        workerPoolId,
      });

      if (this.errors[workerPoolId].length) {
        await Promise.all(this.errors[workerPoolId].map(error => this.reportError({ workerPool, ...error })));
      }
      this.monitor.metric.scanErrors(this.errors[workerPoolId].length, {
        providerId: this.providerId,
        workerPoolId,
      });
    }));
  }

  /**
   * This is called at the end of the provision loop
   */
  async cleanup() {
    this.cloudApi?.logAndResetMetrics();
  }

  /**
   * Used to check in on the state of any operations
   * that are ongoing. This should not be used to gate
   * any other actions in the provider as we may fail to write these
   * operations when we create them. This is just a nice-to-have for
   * reporting configuration/provisioning errors to the users.
   *
   * Returns true if the operation is not done yet.
   *
   * op: an object with keys `name` and optionally `region` or `zone` if it is a region or zone based operation
   * errors: a list that will have any errors found for that operation appended to it
   */
  async handleOperation({ op, errors, monitor, worker }) {
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
      // https://cloud.google.com/compute/docs/reference/rest/v1/regionOperations
      operation = (await this._enqueue('opRead', () => opService.get(args))).data;
    } catch (err) {
      if (err.code !== 404) {
        throw err;
      }
      // If the operation is no longer existing, nothing for us to do
      return false;
    }

    // Let's check back in on the next provisioning iteration if unfinished (other options
    // are PENDING and RUNNING)
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
          launchConfigId: worker?.launchConfigId ?? undefined,
        });
      }
    }
    return false;
  }
}
