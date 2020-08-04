const TestWorker = require('./testworker');
const DockerWorker = require('./dockerworker');

module.exports = async (payload, taskId, features) => {
  let worker = new TestWorker(DockerWorker, undefined, undefined, features);

  await worker.launch();
  let result = await worker.postToQueue(payload, taskId);
  await worker.terminate();

  return result;
};
