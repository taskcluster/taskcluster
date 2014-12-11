/**
Handler of individual tasks beings at claim ends with posting task results.
*/
var debug = require('debug')('runTask');
var request = require('superagent-promise');
var util = require('util');
var waitForEvent = require('./wait_for_event');
var features = require('./features');
var co = require('co');
var pullImage = require('./pull_image_to_stream');
var wordwrap = require('wordwrap')(0, 80, { hard: true });
var scopeMatch = require('taskcluster-base/utils').scopeMatch;

var Promise = require('promise');
var DockerImage = require('./docker_image');
var DockerProc = require('dockerode-process');
var PassThrough = require('stream').PassThrough;
var States = require('./states');

var PAYLOAD_SCHEMA =
  'http://schemas.taskcluster.net/docker-worker/v1/payload.json#';

// This string was super long but I wanted to say all these thing so I broke it
// out into a constant even though most errors are closer to their code...
var IMAGE_ERROR = 'Pulling docker image "%s" has failed this may indicate an ' +
                  'Error with the registry used or an authentication error  ' +
                  'in the worker try pulling the image locally. \n Error %s';

// Prefix used in scope matching for authenticated docker images.
var IMAGE_SCOPE_PREFIX = 'docker-worker:image:';

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
*/
function buildStateHandlers(task) {
  var handlers = [];
  var featureFlags = task.payload.features || {};

  for (var flag in features) {
    var enabled = (flag in featureFlags) ?
      featureFlags[flag] : features[flag].defaults;

    if (enabled) {
      handlers.push(new (features[flag].module)());
    }
  }

  return new States(handlers);
}

/**
Create a list of cached volumes that will be mounted within the docker container.

@param {object} volume cache
@param {object} volumes to mount in the container
 */
function* buildVolumeBindings(taskVolumeBindings, volumeCache, taskScopes) {
  var neededScopes = [];

  for (var volumeName in taskVolumeBindings) {
    neededScopes.push('docker-worker:cache:' + volumeName);
  }

  if (!scopeMatch(taskScopes, neededScopes)) {
    throw new Error(
      'Insufficient scopes to attach "' + volumeName + '" as a cached ' +
      'volume.  Try adding ' + neededScopes + ' to the .scopes array.'
    );
  }

  var bindings = [];
  var caches = [];

  for (var volumeName in taskVolumeBindings) {
    var cacheInstance = yield volumeCache.get(volumeName);
    var binding = cacheInstance.path + ':' + taskVolumeBindings[volumeName];
    bindings.push(binding);
    caches.push(cacheInstance.key);
  }
  return [caches, bindings];
}

function Task(runtime, runId, task, status) {
  this.runId = runId;
  this.task = task;
  this.status = status;
  this.runtime = runtime;

  // Primarly log of all actions for the task.
  this.stream = new PassThrough();
  // states actions.
  this.states = buildStateHandlers(task);
}

Task.prototype = {
  /**
  Build the docker container configuration for this task.

  @param {Array[dockerode.Container]} [links] list of dockerode containers.
  */
  dockerConfig: function* (links) {
    var config = this.task.payload;
    var env = config.env || {};

    // Universally useful environment variables describing the current task.
    env.TASK_ID = this.status.taskId;
    env.RUN_ID = this.runId;

    yield this.runtime.privateKey.decryptEnvVariables(
        this.task.payload, this.status.taskId);

    var procConfig = {
      start: {},
      create: {
        Image: config.image,
        Cmd: config.command,
        Hostname: '',
        User: '',
        AttachStdin: false,
        AttachStdout: true,
        AttachStderr: true,
        Tty: true,
        OpenStdin: false,
        StdinOnce: false,
        Env: taskEnvToDockerEnv(env)
      }
    };

    if (links) {
      procConfig.start.Links = links.map(function(link) {
        return link.name + ':' + link.alias;
      });
    }

    if (this.task.payload.cache) {
      var bindings = yield buildVolumeBindings(this.task.payload.cache,
        this.runtime.volumeCache, this.task.scopes);
      this.volumeCaches = bindings[0];
      procConfig.start.Binds = bindings[1];
    }

    return procConfig;
  },

  fmtLog: function() {
    var args = Array.prototype.slice.call(arguments);
    var str = '[taskcluster] ' + util.format.apply(this, args) + '\r\n';
    // Ensure we generate somewhat nicely aligned 80 width lines.
    return wordwrap(str);
  },

  logHeader: function() {
    var header = this.fmtLog(
      'taskId: %s, workerId: %s',
      this.status.taskId, this.runtime.workerId
    );

    // List caches if used...
    if (this.task.payload.cache) {
      for (var key in this.task.payload.cache) {
        var path = this.task.payload.cache[key];
        header += this.fmtLog(
          'using cache "%s" -> %s', key, path
        );
      }
    }

    return header + '\r\n';
  },

  logFooter: function(success, exitCode, start, finish) {
    // Human readable success/failure thing...
    var humanSuccess = success ?
      'Successful' :
      'Unsuccessful';

    // Yes, date subtraction yields a Number.
    var duration = (finish - start) / 1000;

    return this.fmtLog(
      '%s task run with exit code: %d completed in %d seconds',
      humanSuccess, exitCode, duration
    );
  },

  logSchemaErrors: function(prefix, errors) {
    return this.fmtLog(
      "%s format is invalid json schema errors:\n %s",
      prefix, JSON.stringify(errors, null, 2)
    );
  },

  completeRun: function* (success) {
    yield this.runtime.stats.timeGen(
      'tasks.time.completed',
      this.runtime.queue.reportCompleted(
        this.status.taskId, this.runId, { success: success }
      )
    );
  },

  /**
  Determine when the right time is to issue another reclaim then schedule it
  via set timeout.
  */
  scheduleReclaim: function* (claim) {
    // Figure out when to issue the next claim...
    var takenUntil = (new Date(claim.takenUntil) - new Date());
    var nextClaim = takenUntil / this.runtime.task.reclaimDivisor;

    // This is tricky ensure we have logs...
    this.runtime.log('next claim', {
      taskId: this.status.taskId,
      runId: this.runId,
      time: nextClaim
    });

    // Figure out when we need to make the next claim...
    this.clearClaimTimeout();

    this.claimTimeoutId =
      setTimeout(co(this.reclaimTask).bind(this), nextClaim);
  },


  /**
  Clear next reclaim if one is pending...
  */
  clearClaimTimeout: function() {
    if (this.claimTimeoutId) {
      clearTimeout(this.claimTimeoutId);
      this.claimTimeoutId = null;
    }
  },

  /**
  Reclaim the current task and schedule the next reclaim...
  */
  reclaimTask: function* () {
    this.runtime.log('issue reclaim');
    this.runtime.stats.increment('tasks.reclaims');
    this.claim = yield this.runtime.stats.timeGen(
      'tasks.time.reclaim',
      this.runtime.queue.reclaimTask(this.status.taskId, this.runId)
    );
    this.runtime.log('issued reclaim', { claim: this.claim });
    yield this.scheduleReclaim(this.claim);
  },

  claimTask: function* () {
    this.runtime.stats.increment('tasks.claims');
    var claimConfig = {
      workerId: this.runtime.workerId,
      workerGroup: this.runtime.workerGroup
    };

    this.claim = yield this.runtime.stats.timeGen(
      'tasks.time.claim',
      this.runtime.queue.claimTask(this.status.taskId, this.runId, claimConfig)
    );

    yield this.scheduleReclaim(this.claim);
  },

  claimAndRun: function* () {
    // Issue the first claim... This also kicks off the reclaim timers.
    yield this.claimTask();

    this.runtime.log('claim and run', {
      taskId: this.status.taskId,
      runId: this.runId,
      takenUntil: this.claim.takenUntil
    });

    var success;
    try {
      success = yield this.run();
    } catch (e) {
      // TODO: Reconsider if we should mark the task as failed or something else
      //       at this point... I intentionally did not mark the task completed
      //       here as to allow for a retry by another worker, etc...
      this.clearClaimTimeout();
      throw e;
    }
    // Called again outside so we don't run this twice in the same try/catch
    // segment potentially causing a loop...
    this.clearClaimTimeout();
    // Mark the task appropriately now that all internal state is cleaned up.
    yield this.completeRun(success);
  },

  pullDockerImage: function* () {
    var payload = this.task.payload;
    var dockerImage = new DockerImage(payload.image);
    var dockerImageName = dockerImage.fullPath();

    this.runtime.log('pull image', {
      taskId: this.status.taskId,
      runId: this.runId,
      image: dockerImageName
    });

    // There are cases where we cannot authenticate a docker image based on how
    // the name is formatted (such as `registry`) so simply pull here and do
    // not check for credentials.
    if (!dockerImage.canAuthenticate()) {
      return yield pullImage(
        this.runtime.docker, dockerImageName, this.stream
      );
    }

    var pullOptions = {};
    // See if any credentials apply from our list of registries...
    var credentials = dockerImage.credentials(this.runtime.registries);
    if (credentials) {
      // Validate scopes on the image if we have credentials for it...
      if (!scopeMatch(this.task.scopes, IMAGE_SCOPE_PREFIX + dockerImageName)) {
        throw new Error(
          'Insufficient scopes to pull : "' + dockerImageName + '" try adding ' +
          IMAGE_SCOPE_PREFIX + dockerImageName + ' to the .scopes array.'
        );
      }

      // TODO: Ideally we would verify the authentication before allowing any
      // pulls (some pulls just check if the image is cached) the reason being
      // we have no way to invalidate images once they are on a machine aside
      // from blowing up the entire machine.
      pullOptions.authconfig = credentials;
    }

    return yield pullImage(
      this.runtime.docker, dockerImageName, this.stream, pullOptions
    );
  },

  /**
  Primary handler for all docker related task activities this handles the
  launching/configuration of all tasks as well as the features for the given
  tasks.

  @return {Boolean} success true/false for complete run.
  */
  run: function* () {
    var taskStart = new Date();
    var stats = this.runtime.stats;
    var queue = this.runtime.queue;
    var gc = this.runtime.gc;

    // Cork all writes to the stream until we are done setting up logs.
    this.stream.cork();

    // Task log header.
    this.stream.write(this.logHeader());

    // Build the list of container links...
    var links =
      yield* stats.timeGen('tasks.time.states.linked', this.states.link(this));

    // Hooks prior to running the task.
    yield stats.timeGen('tasks.time.states.created', this.states.created(this));

    // Everything should have attached to the stream by now...
    this.stream.uncork();

    // Validate the schema!
    var payloadErrors =
      this.runtime.schema.validate(this.task.payload, PAYLOAD_SCHEMA);

    if (payloadErrors.length) {
      // Inform the user that this task has failed due to some configuration
      // error on their part.
      this.stream.write(this.logSchemaErrors('`task.payload`', payloadErrors));

      this.stream.write(this.logFooter(
        false, // unsuccessful task
        -1, // negative exit code indicates infrastructure errors usually.
        taskStart, // duration details...
        new Date()
      ));

      // Ensure the stream is completely ended...
      yield this.stream.end.bind(this.stream);

      yield stats.timeGen(
        'tasks.time.states.validation_failed.killed', this.states.killed(this)
      );
      return false;
    }

    // Download the docker image needed for this task... This may fail in
    // unexpected ways and should be handled gracefully to indicate to the user
    // that their task has failed due to a image specific problem rather then
    // some general bug in taskcluster or the worker code.
    try {
      yield this.pullDockerImage();
    } catch (e) {
      this.stream.write(this.fmtLog(IMAGE_ERROR, this.task.payload.image, e));

      // Ensure that the stream has completely finished.
      yield this.stream.end.bind(this.stream, this.logFooter(
        false, // unsuccessful task
        -1, // negative exit code indicates infrastructure errors usually.
        taskStart, // duration details...
        new Date()
      ));

      yield stats.timeGen(
        'tasks.time.states.pull_failed.killed', this.states.killed(this)
      );
      return false;
    }
    gc.markImage(this.task.payload.image);

    try {
      var dockerConfig = yield this.dockerConfig(links);
    } catch (e) {
      this.stream.write(this.fmtLog('Docker configuration could not be ' +
        'created.  This may indicate an authentication error when validating ' +
        'scopes necessary for using caches. \n Error %s', e));

      yield this.stream.end.bind(this.stream, this.logFooter(
        false, // unsuccessful task
        -1, // negative exit code indicates infrastructure errors usually.
        taskStart, // duration details...
        new Date()
      ));

      yield stats.timeGen(
        'tasks.time.states.docker_configuration.killed', this.states.killed(this)
      );
      return false;
    }

    var dockerProc = this.dockerProcess = new DockerProc(
      this.runtime.docker, dockerConfig);
    // Now that we know the stream is ready pipe data into it...
    dockerProc.stdout.pipe(this.stream, {
      end: false
    });

    // start the timer to ensure we don't go overtime.
    var maxRuntimeMS = this.task.payload.maxRunTime * 1000;
    var runtimeTimeoutId = setTimeout(function() {
      stats.increment('tasks.timed_out');
      stats.gauge('tasks.timed_out.max_run_time', this.task.payload.maxRunTime);
      this.runtime.log('task max runtime timeout', {
        maxRunTime: this.task.payload.maxRunTime,
        taskId: this.status.taskId,
        runId: this.runId
      });
      // we don't wait for the promise to resolve just trigger kill here which
      // will cause run below to stop processing the task and give us an error
      // exit code.
      dockerProc.kill();
      this.stream.write(this.fmtLog(
        'Task timeout after %d seconds. Force killing container.',
        this.task.payload.maxRunTime
      ));
    }.bind(this), maxRuntimeMS);

    var exitCode = yield* stats.timeGen('tasks.time.run', dockerProc.run({
      // Do not pull the image as part of the docker run we handle it +
      // authentication above...
      pull: false
    }));

    var success = exitCode === 0;

    clearTimeout(runtimeTimeoutId);

    // XXX: Semi-hack to ensure all consumers of the docker proc stdout get the
    // entire contents. Ideally we could just wait for the end cb but that does
    // not seem to help in this case...
    if (!dockerProc.stdout._readableState.endEmitted) {
      // We wait _before_ extractResult so those states hooks can add items
      // to the stream.
      yield waitForEvent(dockerProc.stdout, 'end');
    }

    // Extract any results from the hooks.
    yield stats.timeGen(
      'tasks.time.states.stopped', this.states.stopped(this)
    );

    this.stream.write(this.logFooter(success, exitCode, taskStart, new Date()));

    // Wait for the stream to end entirely before killing remaining containers.
    yield this.stream.end.bind(this.stream);

    // Garbage collect containers
    gc.removeContainer(dockerProc.container.id, this.volumeCaches);
    yield stats.timeGen('tasks.time.states.killed', this.states.killed(this));

    // If the results validation failed we consider this task failure.
    return success;
  }
};

module.exports = Task;
