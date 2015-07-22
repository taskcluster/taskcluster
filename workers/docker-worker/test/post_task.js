import TestWorker from './testworker';
import DockerWorker from './dockerworker';

export default async (payload, taskId) => {
  let worker = new TestWorker(DockerWorker);

  await worker.launch();
  let result = await worker.postToQueue(payload, taskId);
  await worker.terminate();

  return result;
};
