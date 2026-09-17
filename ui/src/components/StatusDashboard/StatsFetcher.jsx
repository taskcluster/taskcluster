import React, { useContext, useEffect } from 'react';
import {
  Auth,
  Hooks,
  Queue,
  Secrets,
  WorkerManager,
} from '@taskcluster/client-web';
import StatusDashboard from '.';
import useResource from '../../utils/useResource';
import fetchAllPages from '../../utils/fetchAllPages';
import fetchTaskQueueCounts from '../../utils/fetchTaskQueueCounts';
import { TaskclusterClientContext } from '../../utils/TaskclusterClient';
import { DASHBOARD_STATS_PAGE_SIZE } from '../../utils/constants';

const REFRESH_INTERVAL = 30 * 1000;
const pageOptions = { limit: DASHBOARD_STATS_PAGE_SIZE };

// Only the first load blanks a tile; a background refresh keeps showing the
// previous numbers until the new ones arrive.
const asStats = ({ data, loading, error }) => ({
  data,
  error,
  loading: loading && data === null,
});

// Never rejects, so one failing request only blanks its own tiles.
const settle = promise =>
  promise.then(
    value => ({ value }),
    error => ({ error })
  );

// Workers worker-manager does not provision only talk to the queue, so their
// task queues show up in `listTaskQueues` but not in `listWorkerPools`.
export const fetchNonWmTaskQueueCounts = async (queue, workerPoolIds) => {
  const taskQueues = await fetchAllPages(
    options => queue.listTaskQueues(options),
    response => response.taskQueues,
    pageOptions
  );
  const taskQueueIds = taskQueues
    .map(({ taskQueueId }) => taskQueueId)
    .filter(taskQueueId => !workerPoolIds.has(taskQueueId));

  if (taskQueueIds.length === 0) {
    return [];
  }

  const taskQueueCounts = await fetchTaskQueueCounts(queue, taskQueueIds);
  const countsByTaskQueue = new Map(
    taskQueueCounts.map(count => [count.taskQueueId, count])
  );

  return taskQueueIds.map(taskQueueId => {
    const counts = countsByTaskQueue.get(taskQueueId);

    return {
      taskQueueId,
      pendingTasks: counts?.pendingTasks ?? null,
      claimedTasks: counts?.claimedTasks ?? null,
    };
  });
};

export const fetchWorkerPools = async (workerManager, queue) => {
  const [pools, stats] = await Promise.all([
    fetchAllPages(
      options => workerManager.listWorkerPools(options),
      response => response.workerPools,
      pageOptions
    ),
    fetchAllPages(
      options => workerManager.listWorkerPoolsStats(options),
      response => response.workerPoolsStats,
      pageOptions
    ),
  ]);
  const workerPoolIds = new Set(pools.map(({ workerPoolId }) => workerPoolId));
  const statsByPool = new Map(
    stats.map(poolStats => [poolStats.workerPoolId, poolStats])
  );
  // counts need extra scopes, missing them must not blank the pool stats
  const [poolCounts, nonWmTaskQueues] = await Promise.all([
    settle(fetchTaskQueueCounts(queue, workerPoolIds)),
    settle(fetchNonWmTaskQueueCounts(queue, workerPoolIds)),
  ]);
  const countsByPool = new Map(
    (poolCounts.value ?? []).map(counts => [counts.taskQueueId, counts])
  );

  return {
    workerPools: pools.map(pool => {
      const counts = countsByPool.get(pool.workerPoolId);

      return {
        ...pool,
        ...statsByPool.get(pool.workerPoolId),
        pendingTasks: counts?.pendingTasks ?? null,
        claimedTasks: counts?.claimedTasks ?? null,
      };
    }),
    nonWmTaskQueues: nonWmTaskQueues.value ?? null,
    nonWmTaskQueuesError: nonWmTaskQueues.error ?? null,
  };
};

export default function StatsFetcher() {
  const createTaskclusterClient = useContext(TaskclusterClientContext);
  const workerPools = useResource(
    async () => {
      const workerManager = createTaskclusterClient({ Class: WorkerManager });
      const queue = createTaskclusterClient({ Class: Queue });

      return fetchWorkerPools(workerManager, queue);
    },
    { key: 'workerPools' }
  );
  const wmStats = useResource(
    () =>
      // No workerPoolId: one request covering every pool.
      createTaskclusterClient({ Class: WorkerManager }).workerPoolErrorStats(),
    { key: 'wmStats' }
  );
  const provisioners = useResource(
    () => {
      const queue = createTaskclusterClient({ Class: Queue });

      return fetchAllPages(
        options => queue.listProvisioners(options),
        response => response.provisioners,
        pageOptions
      );
    },
    { key: 'provisioners' }
  );
  const hookGroups = useResource(
    async () => {
      const hooks = createTaskclusterClient({ Class: Hooks });
      const { groups } = await hooks.listHookGroups();

      return Promise.all(
        groups.map(async hookGroupId => {
          const { hooks: groupHooks } = await hooks.listHooks(hookGroupId);

          return { hookGroupId, hooks: groupHooks };
        })
      );
    },
    { key: 'hookGroups' }
  );
  const clients = useResource(
    () => {
      const auth = createTaskclusterClient({ Class: Auth });

      return fetchAllPages(
        options => auth.listClients(options),
        response => response.clients,
        pageOptions
      );
    },
    { key: 'clients' }
  );
  const roles = useResource(
    () => {
      const auth = createTaskclusterClient({ Class: Auth });

      return fetchAllPages(
        options => auth.listRoleIds(options),
        response => response.roleIds,
        pageOptions
      );
    },
    { key: 'roles' }
  );
  const secrets = useResource(
    () => {
      const secretsClient = createTaskclusterClient({ Class: Secrets });

      return fetchAllPages(
        options => secretsClient.list(options),
        response => response.secrets,
        pageOptions
      );
    },
    { key: 'secrets' }
  );
  const { data, loading, error, reload: reloadWorkerPools } = workerPools;

  useEffect(() => {
    const interval = setInterval(reloadWorkerPools, REFRESH_INTERVAL);

    return () => clearInterval(interval);
  }, [reloadWorkerPools]);

  return (
    <StatusDashboard
      workerPools={asStats({
        data: data?.workerPools ?? null,
        loading,
        error,
      })}
      nonWmTaskQueues={asStats({
        data: data?.nonWmTaskQueues ?? null,
        loading,
        error: error ?? data?.nonWmTaskQueuesError,
      })}
      provisioners={asStats(provisioners)}
      hookGroups={asStats(hookGroups)}
      clients={asStats(clients)}
      secrets={asStats(secrets)}
      roles={asStats(roles)}
      wmStats={asStats(wmStats)}
    />
  );
}
