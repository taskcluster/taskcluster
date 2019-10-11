/**
 * Handler of individual tasks beginning after the task is claimed and ending
 * with posting task results.
 */
const Debug = require('debug');
const DockerProc = require('dockerode-process');
const { PassThrough } = require('stream');
const States = require('./states');
const taskcluster = require('taskcluster-client');
const promiseRetry = require('promise-retry');
const os = require('os');

const features = require('./features');
const getHostname = require('./util/hostname');
const { fmtLog, fmtErrorLog } = require('./log');
const { hasPrefixedScopes } = require('./util/scopes');
const { scopeMatch } = require('./scopes');
const { validatePayload } = require('./util/validate_schema');
const waitForEvent = require('./wait_for_event');
const uploadToS3 = require('./upload_to_s3');
const _ = require('lodash');
const EventEmitter = require('events');
const libUrls = require('taskcluster-lib-urls');

let debug = new Debug('runTask');

// TODO probably a terrible error message, look at making it better later
const CANCEL_ERROR = 'Task was canceled by another entity. This can happen using ' +
                   'a taskcluster client or by cancelling a task within Treeherder.';

/*
@example

taskEnvToDockerEnv({ FOO: true });
// => ['FOO=true']

@private
@param {Object} env key=value pair for environment variables.
@return {Array} the docker array format for variables
*/
function taskEnvToDockerEnv(env) {
  if (!env || typeof env !== 'object') {
    return env;
  }

  return Object.keys(env).reduce(function(map, name) {
    map.push(name + '=' + env[name]);
    return map;
  }, []);
}

/**
Convert the feature flags into a state handler.

@param {Object} task definition.
@param {Monitor} monitor object implementing record/measure methods
*/
function buildStateHandlers(task, monitor) {
  let handlers = [];
  let featureFlags = task.payload.features || {};

  // performs a set difference (featureFlags - features) to get the set of non supported requested features
  // eslint-disable-next-line no-prototype-builtins
  let diff = _.keys(featureFlags).filter(x => !features.hasOwnProperty(x));

  if (diff.length) {
    throw new Error(`${diff.join()} ${diff.length > 1 ? 'are' : 'is'} not part of valid features`);
  }

  for (let flag in features) {
    let enabled = (flag in featureFlags) ?
      featureFlags[flag] : features[flag].defaults;

    if (enabled) {
      handlers.push(new (features[flag].module)());
      debug(flag);
      monitor.count(`task.feature.${flag}`);
    }
  }

  return new States(handlers);
}

/**
Create a list of cached volumes that will be mounted within the docker container.

@param {object} volume cache
@param {object} volumes to mount in the container
 */
async function buildVolumeBindings(taskVolumeBindings, volumeCache, expandedScopes) {
  let allowed = await hasPrefixedScopes('docker-worker:cache:', taskVolumeBindings, expandedScopes);
  if (!allowed) {
    throw new Error('Insufficient scopes to attach cache volumes.  The task must ' +
    'have scope `docker-worker:cache:<cache-name>` for each cache in `payload.caches`.');
  }

  let bindings = [];
  let caches = [];

  for (let volumeName in taskVolumeBindings) {
    let cacheInstance = await volumeCache.get(volumeName);
    let binding = cacheInstance.path + ':' + taskVolumeBindings[volumeName];
    bindings.push(binding);
    caches.push(cacheInstance.key);
  }
  return [caches, bindings];
}

function runAsPrivileged(task, allowPrivilegedTasks) {
  let taskCapabilities = task.payload.capabilities || {};
  let privilegedTask = taskCapabilities.privileged || false;
  if (!privilegedTask) return false;

  if (!scopeMatch(task.scopes, [['docker-worker:capability:privileged']])) {
    throw new Error(
      'Insufficient scopes to run task in privileged mode. Try ' +
      'adding docker-worker:capability:privileged to the .scopes array'
    );
  }

  if (!allowPrivilegedTasks) {
    throw new Error(
      'Cannot run task using docker privileged mode.  Worker ' +
      'must be enabled to allow running of privileged tasks.'
    );
  }

  return true;
}

async function buildDeviceBindings(devices, expandedScopes) {
  let allowed = await hasPrefixedScopes('docker-worker:capability:device:', devices, expandedScopes);

  if (!allowed) {
    throw new Error('Insufficient scopes to attach devices to task container.  The ' +
    'task must have scope `docker-worker:capability:device:<dev-name>` for each device.');
  }

  let deviceBindings = [];
  for (let deviceType in devices) {
    let device = devices[deviceType];
    device.mountPoints.forEach((mountPoint) => {
      deviceBindings.push(
        {
          PathInContainer: mountPoint,
          PathOnHost: mountPoint,
          CgroupPermissions: 'rwm'
        }
      );
    });
  }

  return deviceBindings;
}

class Reclaimer {
  constructor(runtime, task, primaryClaim, claim) {
    this.runtime = runtime;
    this.task = task;
    this.primaryClaim = primaryClaim;
    this.claim = claim;
    this.stopped = false;

    // start things off
    this.scheduleReclaim();
  }

  /**
   * Stop reclaiming.  If a reclaim is already in progress, it will complete.
   */
  stop() {
    this.stopped = true;
    this.clearClaimTimeout();
  }

  /**
   * Determine when the right time is to issue another reclaim then schedule it
   * via setTimeout.
   */
  scheduleReclaim() {
    let claim = this.claim;

    // Figure out when to issue the next claim...
    let takenFor = (new Date(claim.takenUntil) - new Date());
    let nextClaim = takenFor / this.runtime.task.reclaimDivisor;

    // This is tricky ensure we have logs...
    this.log('next claim', {time: nextClaim});

    // Figure out when we need to make the next claim...
    this.clearClaimTimeout();

    this.claimTimeoutId = setTimeout(async () => await this.reclaimTask(), nextClaim);
  }

  /**
   * Clear next reclaim if one is pending...
   */
  clearClaimTimeout() {
    if (this.claimTimeoutId) {
      clearTimeout(this.claimTimeoutId);
      this.claimTimeoutId = null;
    }
  }

  /**
   * Reclaim the current task and schedule the next reclaim...
   */
  async reclaimTask() {
    let task = this.claim.task;

    if (this.stopped) {
      return;
    }

    this.log('reclaiming task');

    try {
      let queue = this.task.createQueue(this.claim.credentials);
      this.claim = await queue.reclaimTask(
        this.claim.status.taskId, this.claim.runId);
      // reclaim does not return the task, so carry that forward from the previous
      // claim
      this.claim.task = task;
    } catch (e) {
      let errorMessage = `Could not reclaim task. ${e.stack || e}`;
      this.log('error reclaiming task', {error: errorMessage});

      // If this is not the primary claim, just stop trying to reclaim.  The task
      // will attempt to resolve it as superseded, and fail, but the primary task
      // and the other superseded tasks will still be resolved correctly.
      if (this.claim.status.taskId != this.primaryClaim.status.taskId) {
        this.stop();
        return;
      }

      // If status code is 409, assume that the run has already been resolved
      // and/or the deadline-exceeded.  Task run should be handled as though it were
      // canceled.
      if (e.statusCode === 409) {
        this.task.cancel('canceled', errorMessage);
      } else {
        this.task.abort(errorMessage);
      }

      return;
    }

    if (this.claim.status.taskId == this.primaryClaim.status.taskId) {
      this.task.queue = this.task.createQueue(this.claim.credentials);
      this.task.emit('credentials', this.claim.credentials);
    }

    this.log('reclaimed task');
    await this.scheduleReclaim();
  }

  log(msg, options) {
    this.runtime.log(msg, _.defaults({}, options || {}, {
      primaryTaskId: this.primaryClaim.status.taskId,
      primaryRunId: this.primaryClaim.runId,
      taskId: this.claim.status.taskId,
      runId: this.claim.runId,
      takenUntil: this.claim.takenUntil,
    }));
  }
}

class Task extends EventEmitter {
  /**
  @param {Object} runtime global runtime.
  @param {Object} task for this instance.
  @param {Object} claims claim details for this instance (several claims if superseding)
  @param {Object} options
  @param {Number} [options.cpusetCpus] cpu(s) to use for this container/task.
  */
  constructor(runtime, task, claims, options) {
    super();
    this.runtime = runtime;
    this.task = task;
    this.claims = claims;
    this.claim = claims[0]; // first claim is primary -- the one actually executed
    this.status = this.claim.status;
    this.runId = this.claim.runId;
    this.taskState = 'pending';
    this.options = options;

    this.queue = this.createQueue(this.claim.credentials);

    // Primarly log of all actions for the task.
    this.stream = new PassThrough();

    try {
      // states actions.
      this.states = buildStateHandlers(this.task, this.runtime.monitor);
    } catch (err) {
      this.abortRun(fmtErrorLog(err));
      throw err;
    }
  }

  /**
  Build the docker container configuration for this task.

  @param {Array[dockerode.Container]} [links] list of dockerode containers.
  @param {object} [baseEnv] Environment variables that can be overwritten.
  */
  async dockerConfig(imageId, linkInfo) {

    let config = this.task.payload;

    // Allow task specific environment vars to overwrite those provided by hooks
    let env = _.defaults({}, config.env || {}, linkInfo.env || {});

    // Universally useful environment variables describing the current task.
    // Note: these environment variables cannot be overwritten by anyone, we
    //       rely on these for self-validating tasks.
    env.TASK_ID = this.status.taskId;
    env.RUN_ID = this.runId;
    env.TASKCLUSTER_WORKER_TYPE = this.runtime.workerType;
    env.TASKCLUSTER_INSTANCE_TYPE = this.runtime.workerNodeType;
    env.TASKCLUSTER_WORKER_GROUP = this.runtime.workerGroup;
    env.TASKCLUSTER_PUBLIC_IP = this.runtime.publicIp;
    env.TASKCLUSTER_ROOT_URL = this.runtime.rootUrl;
    env.TASKCLUSTER_WORKER_LOCATION = this.runtime.workerLocation;

    let privilegedTask = runAsPrivileged(
      this.task, this.runtime.dockerConfig.allowPrivileged
    );

    let procConfig = {
      start: {},
      create: {
        Image: imageId,
        Cmd: config.command,
        Hostname: '',
        User: '',
        AttachStdin: false,
        AttachStdout: true,
        AttachStderr: true,
        Tty: true,
        OpenStdin: false,
        StdinOnce: false,
        Env: taskEnvToDockerEnv(env),
        HostConfig: {
          Privileged: privilegedTask,
          ShmSize: 1800000000,
          ExtraHosts: [
            'localhost.localdomain:127.0.0.1', // Bug 1488148
          ],
        }
      }
    };

    // Zero is a valid option so only check for existence.
    if ('cpusetCpus' in this.options) {
      procConfig.create.HostConfig.CpusetCpus = this.options.cpusetCpus;
    }

    // expand the task's scopes for access checks
    let auth = new taskcluster.Auth({
      rootUrl: this.runtime.rootUrl,
      credentials: this.runtime.taskcluster,
    });
    let expandedScopes = (await auth.expandScopes({scopes: this.task.scopes})).scopes;

    if (this.options.devices) {
      let bindings = await buildDeviceBindings(this.options.devices, expandedScopes);
      procConfig.create.HostConfig['Devices'] = bindings;
    }

    if (linkInfo.links) {
      procConfig.create.HostConfig.Links = linkInfo.links.map(link => {
        return link.name + ':' + link.alias;
      });
    }

    // Bindings from linkInfo
    let binds = linkInfo.binds.map(b => {
      let binding = `${b.source}:${b.target}`;
      if (b.readOnly) {
        binding += ':ro';
      }
      return binding;
    });

    if (this.task.payload.cache) {
      let bindings = await buildVolumeBindings(this.task.payload.cache,
        this.runtime.volumeCache, expandedScopes);
      this.volumeCaches = bindings[0];
      binds = _.union(binds, bindings[1]);
    }

    // If we have any binds, add them to HostConfig
    if (binds.length > 0) {
      procConfig.create.HostConfig.Binds = binds;
    }

    if(this.task.payload.features && this.task.payload.features.interactive) {
      //TODO: test with things that aren't undefined
      let oldEntrypoint = (await this.runtime.docker.getImage(imageId).inspect()).Entrypoint;
      if(typeof oldEntrypoint === 'string') {
        oldEntrypoint = ['/bin/sh', '-c', oldEntrypoint];
      } else if(oldEntrypoint === undefined) {
        oldEntrypoint = [];
      }
      procConfig.create.Entrypoint = ['/.taskclusterutils/busybox',
        'sh',
        '-e',
        '/.taskclusterutils/interactive_wrapper_run.sh']
        .concat(oldEntrypoint);
    }

    if(this.task.payload.features && this.task.payload.features.allowPtrace) {
      procConfig.create.HostConfig.CapAdd = ['SYS_PTRACE'];
    }

    return procConfig;
  }

  writeLogHeader() {
    let header = [
      `Task ID: ${this.status.taskId}`,
      `Worker ID: ${this.runtime.workerId}`,
      `Worker Group: ${this.runtime.workerGroup}`,
      `Worker Node Type: ${this.runtime.workerNodeType}`,
      `Worker Type: ${this.runtime.workerType}`,
      `Public IP: ${this.runtime.publicIp}`,
      `Hostname: ${os.hostname()}`
    ];
    //
    // List caches if used...
    if (this.task.payload.cache) {
      for (let key in this.task.payload.cache) {
        let path = this.task.payload.cache[key];
        header.push(`using cache "${key}" -> ${path}`);
      }
    }

    for (let line of header) {
      this.stream.write(fmtLog(line));
    }

    this.stream.write('\r\n');
  }

  logFooter(success, exitCode, start, finish) {
    // Human readable success/failure thing...
    let humanSuccess = success ?
      'Successful' :
      'Unsuccessful';

    // Yes, date subtraction yields a Number.
    let duration = (finish - start) / 1000;

    return fmtLog(
      '%s task run with exit code: %d completed in %d seconds',
      humanSuccess, exitCode, duration
    );
  }

  logSchemaErrors(prefix, errors) {
    return fmtErrorLog(
      '%s format is invalid json schema errors:\n %s',
      prefix, JSON.stringify(errors, null, 2)
    );
  }

  /**
   * Aborts a run that is currently running or being prepared to run (pulling images,
   * establishing states, etc).  This will optionally write an error to the stream
   * and then write the footer and kill states.
   *
   * @param {String} error - Option error to write to the stream prior to aborting
   */
  async abortRun(error='') {
    if (!this.isCanceled()) {
      this.taskState = 'aborted';
    }

    this.runtime.monitor.count('task.state.abort');

    this.runtime.log('task aborted', {
      taskId: this.status.taskId,
      runId: this.runId,
      exception: this.taskException || '',
      error: error.stack || error
    });

    if (error) this.stream.write(error);

    // Ensure that the stream has completely finished.
    await this.stream.end(this.logFooter(
      false, // unsuccessful task
      -1, // negative exit code indicates infrastructure errors usually.
      this.taskStart, // duration details...
      new Date()
    ));

    try {
      // Run killed hook
      await this.states.killed(this);
    }
    catch (e) {
      // Do not throw, killing the states is a best effort here when aborting
      //
      this.runtime.log('error killing states', {
        error: `Could not kill states properly. ${e.stack}`
      });
    }

    if (this.isAborted()) {
      let queue = this.queue;
      let reporter = this.taskException ? queue.reportException : queue.reportFailed;
      let reportDetails = [this.status.taskId, this.runId];
      if (this.taskException) reportDetails.push({ reason: this.taskException });

      // mark any tasks that this one superseded as resolved with
      // reason 'worker-shutdown', which means they stand to be retried
      // immediately
      await this.resolveSuperseded(this.status.taskId, this.runId,
        false, 'worker-shutdown');

      await reporter.apply(queue, reportDetails);
    }

    this.runtime.log('task resolved', {
      taskId: this.status.taskId,
      runId: this.runId,
      taskState: this.taskState
    });

    return false;
  }

  /**
   * Resolves a run that has completed and reports to the proper exchange.
   *
   * If a task has been canceled or aborted, abortRun() should be used since the
   * run did not complete.
   *
   * @param {Boolean} success
   */
  async completeRun(success) {
    let queue = this.queue;
    let reportDetails = [this.status.taskId, this.runId];
    let reporter;
    let taskState;

    if (success) {
      reporter = queue.reportCompleted;
      taskState = 'completed';
    } else if (!this.task.payload.onExitStatus) {
      reporter = queue.reportFailed;
      taskState = 'failed';
    } else {
      let retry = this.task.payload.onExitStatus.retry;
      if (retry && retry.includes(this.exitCode)) {
        taskState = 'retry';
        reportDetails.push({reason: 'intermittent-task'});
        reporter = queue.reportException;
      } else {
        reporter = queue.reportFailed;
        taskState = 'failed';
      }
      let purgeStatuses = this.task.payload.onExitStatus && this.task.payload.onExitStatus.purgeCaches;
      if (purgeStatuses && purgeStatuses.includes(this.exitCode)) {
        for (let cacheKey of this.volumeCaches) {
          this.runtime.volumeCache.purgeInstance(cacheKey);
        }
      }
    }

    // mark any tasks that this one superseded as resolved, adding the
    // necessary artifacts pointing to this build
    await this.resolveSuperseded(this.status.taskId, this.runId, true, 'superseded');

    await reporter.apply(queue, reportDetails);

    this.runtime.log('task resolved', {
      taskId: this.status.taskId,
      runId: this.runId,
      taskState: taskState
    });
  }

  /**
   * Resolves all of the non-primary claims for this task, optionally
   * adding an artifact to each one named "public/superseded-by"
   * containing the taskId/runId of the primary claim.
   *
   * @param {String} primaryTaskId taskId of the primary task
   * @param {Integer} primaryRunId runId of the primary task
   * @param {Boolean} addArtifacts if true, add the superseded-by artifacts
   * @param {String} reason the exception reason passed to the queue
   */

  async resolveSuperseded(primaryTaskId, primaryRunId, addArtifacts, reason) {
    let supersedes = [];
    let log = this.runtime.log;

    await Promise.all(this.claims.map(async (c) => {
      let taskId = c.status.taskId;
      let runId = c.runId;
      if (taskId == primaryTaskId && runId == primaryRunId) {
        return;
      }

      try {
        let queue = this.createQueue(c.credentials);
        await queue.reportException(taskId, runId, {reason});

        if (addArtifacts) {
          let task = c.task;
          // set the artifact expiration to match the task
          let expiration = task.expires || taskcluster.fromNow(task.deadline, '1 year');
          let content = {'taskId': primaryTaskId, 'runId': primaryRunId};
          let contentJson = JSON.stringify(content);
          await uploadToS3(queue, taskId, runId, contentJson,
            'public/superseded-by.json', expiration, {
              'content-type': 'application/json',
              'content-length': contentJson.length,
            });

          supersedes.push({taskId, runId});
        }
      } catch (e) {
        // failing to resolve a non-primary claim is not a big deal: it will
        // either time out and go back in the queue, or it was cancelled or
        // otherwise modified while we were working on it.
        log('while resolving superseded task: ' + e, {
          primaryTaskId,
          primaryRunId,
          taskId,
          runId,
        });
      }
    }));

    if (addArtifacts && supersedes.length > 0) {
      let task = this.claim.task;
      let expiration = task.expires || taskcluster.fromNow(task.deadline, '1 year');
      let contentJson = JSON.stringify(supersedes);
      await uploadToS3(this.queue, primaryTaskId, primaryRunId, contentJson,
        'public/supersedes.json', expiration, {
          'content-type': 'application/json',
          'content-length': contentJson.length,
        });
    }
  }

  /**
   * Schedule reclaims of each claim
   */
  scheduleReclaims() {
    this.reclaimers = this.claims.map(
      c => new Reclaimer(this.runtime, this, this.claim, c));
  }

  stopReclaims() {
    this.reclaimers.forEach(r => r.stop());
    this.reclaimers = [];
  }

  setRuntimeTimeout(maxRuntime) {
    let maxRuntimeMS = maxRuntime * 1000;
    let runtimeTimeoutId = setTimeout(function() {
      this.taskState = 'aborted';
      this.runtime.monitor.count('task.runtimeExceeded');

      this.runtime.log('task max runtime timeout', {
        maxRunTime: this.task.payload.maxRunTime,
        taskId: this.status.taskId,
        runId: this.runId
      });

      // we don't wait for the promise to resolve just trigger kill here which
      // will cause run to stop processing the task and give us an error
      // exit code.
      this.dockerProcess.kill();
      this.stream.write(fmtErrorLog(
        'Task timeout after %d seconds. Force killing container.',
        this.task.payload.maxRunTime
      ));
    }.bind(this), maxRuntimeMS);
    return runtimeTimeoutId;
  }

  async start() {
    this.runtime.log('task start', {
      taskId: this.status.taskId,
      runId: this.runId,
    });

    // Task has already been claimed, schedule reclaiming
    await this.scheduleReclaims();

    let success;
    try {
      success = await this.run();
    } catch (e) {
      // TODO: Reconsider if we should mark the task as failed or something else
      //       at this point... I intentionally did not mark the task completed
      //       here as to allow for a retry by another worker, etc...
      this.stopReclaims();
      // If task ends prematurely, make sure the container and volume caches get
      // flagged to be cleaned up.
      if (this.dockerProcess && this.dockerProcess.container) {
        this.runtime.gc.removeContainer(this.dockerProcess.container.id, this.volumeCaches);
      }
      throw e;
    }
    // Called again outside so we don't run this twice in the same try/catch
    // segment potentially causing a loop...
    this.stopReclaims();

    if (this.dockerProcess && this.dockerProcess.container) {
      this.runtime.gc.removeContainer(this.dockerProcess.container.id, this.volumeCaches);
    }

    // Mark the task appropriately now that all internal state is cleaned up.
    if (!this.isCanceled() && !this.isAborted()) await this.completeRun(success);
  }

  isAborted() {
    return this.taskState === 'aborted';
  }

  isCanceled() {
    return this.taskState === 'canceled';
  }

  /**
   * Aborts the running of the task.  This is similar to cancelling a task, but
   * will allow time to upload artifacts and report the run as an exception instead.
   *
   * @param {String} reason - Reason for aborting the test run (Example: worker-shutdown)
  */
  abort(reason) {
    this.stopReclaims();
    this.taskState = 'aborted';
    this.taskException = reason;
    if (this.dockerProcess) this.dockerProcess.kill();

    this.stream.write(
      fmtErrorLog(`Task has been aborted prematurely. Reason: ${reason}`)
    );
  }

  /**
   * Cancel the running of the task.  Task cancellation was performed by an external
   * entity and has already been published to task-exception exchange.  This will
   * kill the docker container that might be running, attempt to release resources
   * that were linked, as well as prevent artifacts from uploading, which cannot
   * be done after a run is resolved.
   *
   * @param {String} reason - Reason for cancellation
   * @param {String} error - Optional error message to provide.
   */
  cancel(exception, errorMessage=CANCEL_ERROR) {
    this.taskState = 'canceled';
    this.taskException = exception;

    this.runtime.log('cancel task', {
      taskId: this.status.taskId,
      runId: this.runId,
      message: errorMessage
    });

    if (this.dockerProcess) this.dockerProcess.kill();

    this.stream.write(fmtErrorLog(errorMessage));
  }

  /**
  Primary handler for all docker related task activities this handles the
  launching/configuration of all tasks as well as the features for the given
  tasks.

  @return {Boolean} success true/false for complete run.
  */
  async run() {
    this.taskState = 'running';
    this.taskStart = new Date();
    let monitor = this.runtime.monitor;
    this.hostname = getHostname(
      this.runtime,
      new Date(Date.now() + this.task.payload.maxRunTime * 1000)
    );

    // Cork all writes to the stream until we are done setting up logs.
    this.stream.cork();

    // Task log header.
    this.writeLogHeader();
    let linkInfo = {};
    try {
      const retryOptions = {
        retries: 3,
        minTimeout: 2000,
        randomize: true
      };

      // Build the list of container links... and base environment variables
      if (this.states) {
        linkInfo = await promiseRetry(retry => {
          return this.states.link(this).catch(retry);
        }, retryOptions);
      }

      // Hooks prior to running the task.
      await promiseRetry(retry => {
        return this.states.created(this).catch(retry);
      }, retryOptions);
    } catch (e) {
      return await this.abortRun(
        fmtErrorLog(
          'Task was aborted because states could not be created ' +
          `successfully. ${e.message}`
        )
      );
    }

    // Everything should have attached to the stream by now...
    this.stream.uncork();

    if (this.isCanceled() || this.isAborted()) {
      return await this.abortRun();
    }

    const schema = libUrls.schema(this.runtime.rootUrl, 'docker-worker', 'v1/payload.json#');
    let payloadErrors = validatePayload(this.runtime.validator, this.task.payload, this.status, schema);

    if (payloadErrors.length) {
      // Inform the user that this task has failed due to some configuration
      // error on their part.
      this.taskException = 'malformed-payload';
      monitor.count('task.validationFailure');
      return await this.abortRun(
        this.logSchemaErrors('`task.payload`', payloadErrors)
      );
    }

    // Download the docker image needed for this task... This may fail in
    // unexpected ways and should be handled gracefully to indicate to the user
    // that their task has failed due to a image specific problem rather then
    // some general bug in taskcluster or the worker code.
    if (this.isCanceled() || this.isAborted()) {
      return await this.abortRun();
    }

    let imageId;
    try {
      let im = this.runtime.imageManager;

      imageId = await promiseRetry(retry => {
        return im.ensureImage(
          this.task.payload.image,
          this.stream,
          this,
          this.task.scopes).catch(retry);
      }, {
        maxTimeout: 1000,
        minTimeout: 10,
        factor: 1.2,
        randomize: true,
        retries: 3,
      });

      this.imageHash = imageId;
      this.runtime.gc.markImage(imageId);
    } catch (e) {

      monitor.count('task.image.pullFailed');
      return await this.abortRun(
        fmtErrorLog('Pulling docker image has failed.') +
        fmtErrorLog(`Error: ${e.message}`)
      );
    }

    if (this.isCanceled() || this.isAborted()) {
      return await this.abortRun();
    }

    let dockerConfig;
    try {
      dockerConfig = await this.dockerConfig(imageId, linkInfo);
    } catch (e) {
      let error = fmtErrorLog('Docker configuration could not be ' +
        'created.  This may indicate an authentication error when validating ' +
        'scopes necessary for running the task. \n %s', e.stack);
      return await this.abortRun(error);
    }

    if (this.isCanceled() || this.isAborted()) {
      return await this.abortRun();
    }
    let dockerProc = this.dockerProcess = new DockerProc(
      this.runtime.docker, dockerConfig);
    // Now that we know the stream is ready pipe data into it...
    dockerProc.stdout.pipe(this.stream, {
      end: false
    });

    let runtimeTimeoutId = this.setRuntimeTimeout(this.task.payload.maxRunTime);

    if (this.isCanceled() || this.isAborted()) {
      return await this.abortRun();
    }

    // Call started hook when container is started
    dockerProc.once('container start', async (container) => {
      try {
        await this.states.started(this);
      } catch (e) {
        return await this.abortRun(
          fmtErrorLog(
            'Task was aborted because states could not be started ' +
            `successfully. ${e}`
          )
        );
      }
    });

    this.runtime.log('task run');
    this.stream.write(fmtLog('=== Task Starting ==='));
    try {
      let taskStart = new Date();
      this.exitCode = await dockerProc.run({
        // Do not pull the image as part of the docker run we handle it +
        // authentication above...
        pull: false
      });
      monitor.measure('task.runtime', Date.now() - taskStart);
    } catch(error) {
      // Catch any errors starting the docker container.  This can be form an invalid
      // command being specified in the task payload, or a docker related issue.
      // XXX Look into determining if this was an issue starting the container because
      // of the command specified or an internal error. Hard part, 500 error can
      // either mean the command caused the container to not start or docker had
      // an internal error such as not being able to a directory (aufs issues).
      this.runtime.log('error starting container', {
        taskId: this.status.taskId,
        runId: this.runId,
        error: error.stack || error
      });
      this.stream.write(fmtErrorLog('Failure to properly start execution environment.'));
      this.stream.write(fmtErrorLog(error.message));
      this.exitCode = -1;
    }

    this.stream.write(fmtLog('=== Task Finished ==='));

    let success = this.exitCode === 0;

    clearTimeout(runtimeTimeoutId);

    // XXX: Semi-hack to ensure all consumers of the docker proc stdout get the
    // entire contents. Ideally we could just wait for the end cb but that does
    // not seem to help in this case...
    if (!dockerProc.stdout._readableState.endEmitted) {
      // We wait _before_ extractResult so those states hooks can add items
      // to the stream.
      await waitForEvent(dockerProc.stdout, 'end');
    }

    if (this.isCanceled() || this.isAborted()) {
      return await this.abortRun();
    }

    // Extract any results from the hooks.
    try {
      await this.states.stopped(this);
    } catch (e) {
      // If task finished successfully, mark it as unsuccessful.
      // Otherwise artifact uploading most likely will be expected
      // to fail if the task did not finish successfully.
      if (success) {
        success = false;
        this.exitCode = -1;
      }

      this.stream.write(fmtErrorLog(e.message));
    }

    this.stream.write(this.logFooter(success, this.exitCode, this.taskStart, new Date()));

    // Wait for the stream to end entirely before killing remaining containers.
    await this.stream.end();

    try {
      await this.states.killed(this);
    } catch(e) {
      // If killing states was unsucessful, mark task as failed.  If error is not
      // caught the task remains in limbo until claim expires.
      success = false;

      // Unfortunately in the current implementation, logging is bundled with killing
      // states.  At this point the task log stream is ended, and possible the log already
      // uploaded.  This is a best effort of capturing an error.
      this.runtime.log('error killing states', {
        error: `Could not kill states properly. ${e.stack || e}`
      });
    }

    // If the results validation failed we consider this task failure.
    if (this.isCanceled() || this.isAborted()) {
      return await this.abortRun();
    }

    return success;
  }

  /**
  Create a new queue using temp credentials.

  @param {credentials} Temporary credentials.
  @param {runtime} Runtime config.

  @return New queue.
  */
  createQueue(credentials) {
    return new taskcluster.Queue({
      rootUrl: this.runtime.rootUrl,
      credentials: credentials,
    });
  }
}

module.exports = {
  Reclaimer,
  Task
};
