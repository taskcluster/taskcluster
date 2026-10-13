import { Auth, Queue, WorkerManager } from '@taskcluster/client-web';

export const getClient = ({
  Class,
  credentialAgent,
  getCredentials,
  user,
  ...options
}) => {
  if ([credentialAgent, getCredentials, user].filter(Boolean).length > 1) {
    throw new Error(
      'Specify only one of credentialAgent, getCredentials or user'
    );
  }

  const resolvedCredentialAgent =
    credentialAgent || (getCredentials ? { getCredentials } : null);

  return new Class({
    rootUrl: window.env.TASKCLUSTER_ROOT_URL,
    ...(resolvedCredentialAgent
      ? { credentialAgent: resolvedCredentialAgent }
      : { credentials: user?.credentials }),
    ...options,
  });
};

export const removeWorker = async ({
  workerPoolId,
  workerGroup,
  workerId,
  getCredentials,
}) => {
  const wm = getClient({
    Class: WorkerManager,
    getCredentials,
    authorizedScopes: [
      `worker-manager:remove-worker:${workerPoolId}/${workerGroup}/${workerId}`,
    ],
  });

  await wm.removeWorker(workerPoolId, workerGroup, workerId);
};

export const changeTaskPriority = async ({
  taskId,
  priority,
  getCredentials,
}) => {
  const queue = getClient({ Class: Queue, getCredentials });

  await queue.changeTaskPriority(taskId, { newPriority: priority });
};

export const changeTaskGroupPriority = async ({
  taskGroupId,
  priority,
  getCredentials,
}) => {
  const queue = getClient({ Class: Queue, getCredentials });

  await queue.changeTaskGroupPriority(taskGroupId, { newPriority: priority });
};
export const getAuditHistory = async (
  entityId,
  entityType,
  getCredentials,
  { limit }
) => {
  const auth = getClient({
    Class: Auth,
    getCredentials,
    authorizedScopes: [`auth:audit-history:${entityType}`],
  });

  return auth.getEntityHistory(entityType, entityId, {
    limit,
  });
};

export const getClientAuditHistory = async (
  clientId,
  getCredentials,
  { limit }
) => {
  const auth = getClient({
    Class: Auth,
    getCredentials,
    authorizedScopes: [`auth:client-audit-history:${clientId}`],
  });

  return auth.listAuditHistory(clientId, {
    limit,
  });
};
