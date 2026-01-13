import { Queue } from '@taskcluster/client-web';
import { getClient } from './client';

const fetchMultiple = async (fn, prop, taskIds, user) => {
  const queue = getClient({ Class: Queue, user });
  const chunkSize = 500;
  const chunks = Math.ceil(taskIds.length / chunkSize);
  const promises = Array.from({ length: chunks }).map(async (_, i) => {
    const chunk = taskIds.slice(i * chunkSize, (i + 1) * chunkSize);
    const response = await queue[fn]({ taskIds: chunk });

    return response[prop];
  });
  const allChunkResults = await Promise.all(promises);

  return allChunkResults.flat();
};

export const getTaskStatuses = async ({ taskIds, user }) => {
  return fetchMultiple('statuses', 'statuses', taskIds, user);
};

export const getTaskDefinitions = async ({ taskIds, user }) => {
  return fetchMultiple('tasks', 'tasks', taskIds, user);
};
