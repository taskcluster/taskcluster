var JobAPI = require('./job_api');
var Task = require('./task');
var DockerProc = require('dockerode-process');
var Middleware = require('middleware-object-hooks');

var MIDDLEWARES = {
  times: require('./middleware/times'),
  bufferLog: require('./middleware/buffer_log'),
  azureLiveLog: require('./middleware/azure_livelog'),
  containerMetrics: require('./middleware/container_metrics')
};

var debug = require('debug')('taskcluster-docker-worker:taskrunner');

/**
@param {Object} request task.
@return Promise
*/
function runTask(docker, request) {
  // task result/output
  var output = {
    artifacts: {},
    extra_info: {}
  };

  // details to send during the claim.
  var claim = {};

  var api = new JobAPI(request);
  var task = new Task(api.job);
  var middleware = new Middleware();

  // always turn on times
  middleware.use(MIDDLEWARES.times());

  // this is mostly a debugging middleware so its off by default
  if (task.feature('buffer_log', false)) {
    middleware.use(MIDDLEWARES.bufferLog());
  }

  // live logging should always be on
  if (task.feature('azure_livelog', true)) {
    middleware.use(MIDDLEWARES.azureLiveLog());
  }

  if (task.feature('metrics', false)) {
    middleware.use(MIDDLEWARES.containerMetrics('tasks'));
  }

  var dockerProcess = new DockerProc(docker, {
    start: task.startContainerConfig(),
    create: task.createContainerConfig()
  });

  debug('run task', api.job);
  return middleware.run('start', claim, task, dockerProcess).then(
    function(claimPayload) {
      debug('claim payload', claimPayload);
      return api.sendClaim(claimPayload);
    }
  ).then(
    function initiateExecute(value) {
      return dockerProcess.run();
    }
  ).then(
    function processRun(code) {

      output.task_result = {
        exit_status: code
      };

      return middleware.run('end', output, task, dockerProcess);
    }
  ).then(
    function sendFinish(output) {
      return api.sendFinish(output).then(
        function() {
          return dockerProcess.remove();
        }
      );
    }
  );
}

module.exports = runTask;
