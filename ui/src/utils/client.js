import { WorkerManager } from 'taskcluster-client-web';

export const getClient = ({ Class, user, ...options }) => {
  return new Class({
    rootUrl: window.env.TASKCLUSTER_ROOT_URL,
    credentials: user ? user.credentials : undefined,
    ...options,
  });
};

export const removeWorker = async ({
  workerPoolId,
  workerGroup,
  workerId,
  user,
}) => {
  const wm = getClient({
    Class: WorkerManager,
    user,
    authorizedScopes: [
      `worker-manager:remove-worker:${workerPoolId}/${workerGroup}/${workerId}`,
    ],
  });

  await wm.removeWorker(workerPoolId, workerGroup, workerId);
};
