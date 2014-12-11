var TestWorker = require('./testworker');
var DockerWorker = require('./dockerworker');

module.exports = function* postTask(payload, taskId) {
  var worker = new TestWorker(DockerWorker);

  yield worker.launch();
  var result = yield worker.postToQueue(payload, taskId);
  yield worker.terminate();

  return result;
};
