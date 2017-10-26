const TestWorker = require('./testworker');
const DockerWorker = require('./dockerworker');

module.exports = async (payload, taskId) => {
  let worker = new TestWorker(DockerWorker);

  await worker.launch();
  let result = await worker.postToQueue(payload, taskId);
  await worker.terminate();

  return result;
};
