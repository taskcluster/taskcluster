var RequestAPI = require('./request_api');
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
  // object sent over in the `start` result
  var startResult = {};
  // object sent over in the `end` result
  var endResult = {};

  var api = new RequestAPI(request);
  var task = new Task(request.task);
  var middleware = new Middleware();

  // always turn on times
  middleware.use(MIDDLEWARES.times());

  // this is mostly a debugging middleware so its off by default
  if (task.feature('bufferLog', false)) {
    middleware.use(MIDDLEWARES.bufferLog());
  }

  // live logging should always be on
  if (task.feature('azureLivelog', true)) {
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
  return middleware.run('start', startResult, task, dockerProcess).then(
    function(payload) {
      debug('claim payload', payload);
      return api.sendStart(payload);
    }
  ).then(
    function initiateExecute(value) {
      return dockerProcess.run();
    }
  ).then(
    function processRun(code) {
      endResult.exitCode = code;
      return middleware.run('stop', endResult, task, dockerProcess);
    }
  ).then(
    function sendEnd(payload) {
      return api.sendStop(payload).then(
        function() {
          return dockerProcess.remove();
        }
      );
    }
  );
}

module.exports = runTask;
