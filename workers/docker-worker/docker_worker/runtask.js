var DockerProc  = require('dockerode-process');
var Middleware  = require('middleware-object-hooks');
var debug       = require('debug')('runTask');
var times       = require('./middleware/times');


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

// Middlewares in order they should be loaded, based on feature flags
MIDDLEWARE_BUILDERS = [
  './middleware/buffer_log',
  './middleware/azure_livelog',
  './middleware/container_metrics',
  './middleware/artifact_extractor',
  './middleware/artifact_log'
].map(function(path) {
  return require(path);
});

/** Build middleware handler for a task based on it's feature flags */
var buildMiddleware = function(task) {
  // Create middleware handler
  var middleware = new Middleware();

  // Always turn on times, we don't even want to read a feature flag for this
  middleware.use(times());

  // For each middleware option available, read the feature flag, and apply it
  // if necessary.
  MIDDLEWARE_BUILDERS.forEach(function(builder) {
    // Find feature flag
    var featureFlag = task.payload.features[builder.featureFlagName];

    // If undefined, use the default feature flag
    if (featureFlag === undefined) {
      featureFlag = builder.featureFlagDefault;
    }

    // Create middleware instance
    var instance = builder(featureFlag);

    // Use instance if something was build with the given flag
    if (instance) {
      middleware.use(instance);
    }
  });

  return middleware;
};

/** Return a promise that a TaskRun instance is completed */
var runTask = function(taskRun, docker) {
  // Keep reclaiming the task until we report it completed or clearKeepTask()
  taskRun.keepTask();

  // Build middleware handler
  var middleware  = buildMiddleware(taskRun.task);

  // Create docker process
  var dockerProcess = new DockerProc(docker, {
    // TODO: Consider using middleware hooks for configuring container configs
    start:    {},
    create:   {
      Image:        taskRun.task.payload.image,
      Cmd:          taskRun.task.payload.command,
      Hostname:     '',
      User:         '',
      AttachStdin:  false,
      AttachStdout: true,
      AttachStderr: true,
      Tty:          true,
      OpenStdin:    false,
      StdinOnce:    false,
      Env:          taskEnvToDockerEnv(taskRun.task.payload.env || {})
    }
  });

  // Run middleware hooks
  var started, finished, success, timer;
  return middleware.run(
    'start', {}, taskRun, dockerProcess
  ).then(function() {
    return middleware.run('declareLogs', {}, taskRun, dockerProcess);
  }).then(function(logs) {
    return taskRun.putLogs({
      version:        '0.2.0',
      logs:           logs
    });
  }).then(function() {
    debug('Starting docker for task: %s', taskRun.status.taskId);
    started = new Date();
    timer = setTimeout(function() {
      debug("Kill docker container for %s as maxRunTime have been reached",
            taskRun.status.taskId);
      dockerProcess.kill();
    }, taskRun.task.payload.maxRunTime * 1000);
    return dockerProcess.run();
  }).then(function(exitCode) {
    clearTimeout(timer);
    debug('Docker for task %s finished', taskRun.status.taskId);
    finished = new Date();
    success = (exitCode === 0);
    var result = {
      version:            '0.2.0',
      artifacts:          {},
      statistics: {
        started:          started.toJSON(),
        finished:         finished.toJSON()
      },
      metadata: {
        workerGroup:      taskRun.owner.workerGroup,
        workerId:         taskRun.owner.workerId,
        success:          success
      },
      // This is worker/task specific results
      result: {
        exitCode:       exitCode
      }
    };
    return middleware.run('extractResult', result, taskRun, dockerProcess);
  }).then(function(result) {
    //TODO: Run middleware step for uploading artifacts... we could optimize
    //      this by running that step in parallel, perhaps by asking a
    //      sequential middleware run to declare artifacts. Then we can also
    //      fetch all signed URLs at once.

    // Remove docker container
    dockerProcess.remove();
    return taskRun.putResult(result);
  }).then(function() {
    return taskRun.taskCompleted(success);
  }).then(null, function(err) {
    // Whatever happens we should stop reclaiming the task!!!
    taskRun.clearKeepTask();
    // Also, let's just remove the docker container, just in case :)
    dockerProcess.remove();
    // Log the error, but let's not consume it here
    debug("Error in runTask(): %s, as JSON: %j", err, err);
    throw err;
  });
};


// Export runTask
module.exports = runTask;
