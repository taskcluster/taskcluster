import { Auth, Queue, WorkerManager } from '@taskcluster/client-web';

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

export const changeTaskPriority = async ({ taskId, priority, user }) => {
  const queue = getClient({ Class: Queue, user });

  await queue.changeTaskPriority(taskId, { newPriority: priority });
};

export const changeTaskGroupPriority = async ({
  taskGroupId,
  priority,
  user,
}) => {
  const queue = getClient({ Class: Queue, user });

  await queue.changeTaskGroupPriority(taskGroupId, { newPriority: priority });
};
export const getAuditHistory = async (
  entityId,
  entityType,
  user,
  { limit }
) => {
  const auth = getClient({
    Class: Auth,
    user,
    authorizedScopes: [`auth:audit-history:${entityType}`],
  });

  return auth.getEntityHistory(entityType, entityId, {
    limit,
  });
};

export const getClientAuditHistory = async (clientId, user, { limit }) => {
  const auth = getClient({
    Class: Auth,
    user,
    authorizedScopes: [`auth:client-audit-history:${clientId}`],
  });

  return auth.listAuditHistory(clientId, {
    limit,
  });
};
