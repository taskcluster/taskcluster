import { getClient } from './client';

const { Auth } = require('taskcluster-client-web');

export async function getAuditHistory ({ user, entityType, entityId }) {
  const auth = getClient({ Class: Auth, user });
  return await auth.getEntityHistory(entityType, entityId);
};
