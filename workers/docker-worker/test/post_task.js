var TestWorker = require('./testworker');
var DockerWorker = require('./dockerworker');

module.exports = function* postTask(payload) {
  var worker = new TestWorker(DockerWorker);

  yield worker.launch();
  var result = yield worker.postToQueue(payload);
  yield worker.terminate();

  return result;
};
