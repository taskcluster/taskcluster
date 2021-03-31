export default function splitTaskQueueId(taskQueueId) {
  const split = taskQueueId.split('/');

  return { provisionerId: split[0], workerType: split[1] };
}
