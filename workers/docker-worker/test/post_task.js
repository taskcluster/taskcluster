var TestWorker = require('./testworker');
var LocalWorker = require('./localworker');

module.exports = function* postTask(payload) {
  var worker = new TestWorker(LocalWorker);

  yield worker.launch();
  var result = yield worker.postToQueue(payload);
  yield worker.terminate();

  return result;
};
