import taskcluster from '@taskcluster/client';

/**
 * Creates temporary credentials for a task run.
 */
const taskCredentials = function(taskId, runId, workerGroup, workerId, takenUntil, scopes, permaCreds) {
  const clientId = [
    'task-client',
    taskId,
    `${runId}`,
    'on',
    workerGroup,
    workerId,
    'until',
    `${takenUntil.getTime() / 1000}`,
  ].join('/');
  return taskcluster.createTemporaryCredentials({
    clientId,
    start: new Date(),
    expiry: takenUntil,
    scopes: [
      'queue:reclaim-task:' + taskId + '/' + runId,
      'queue:resolve-task:' + taskId + '/' + runId,
      'queue:create-artifact:' + taskId + '/' + runId,
    ].concat(scopes),
    credentials: permaCreds,
  });
};

export default taskCredentials;
