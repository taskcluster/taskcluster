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
import { TaskclusterClientContext } from '../../utils/TaskclusterClient';
import { DASHBOARD_STATS_PAGE_SIZE } from '../../utils/constants';

const REFRESH_INTERVAL = 30 * 1000;
// There is no batch endpoint for pending counts, so it is one request per
// worker pool, issued in bounded batches.
const PENDING_TASKS_CONCURRENCY = 30;
const pageOptions = { limit: DASHBOARD_STATS_PAGE_SIZE };

const fetchPendingTasks = async (queue, workerPoolIds) => {
  const counts = new Map();

  for (
    let start = 0;
    start < workerPoolIds.length;
    start += PENDING_TASKS_CONCURRENCY
  ) {
    const batch = workerPoolIds.slice(start, start + PENDING_TASKS_CONCURRENCY);

    await Promise.all(
      batch.map(async workerPoolId => {
        try {
          // a worker pool id is also a task queue id
          const { pendingTasks } = await queue.pendingTasks(workerPoolId);

          counts.set(workerPoolId, pendingTasks);
        } catch {
          // A pool whose count cannot be read contributes nothing rather than
          // failing every worker-manager tile.
          counts.set(workerPoolId, 0);
        }
      })
    );
  }

  return counts;
};

// Only the first load blanks a tile; a background refresh keeps showing the
// previous numbers until the new ones arrive.
const asStats = ({ data, loading, error }) => ({
  data,
  error,
  loading: loading && data === null,
});

export default function StatsFetcher() {
  const createTaskclusterClient = useContext(TaskclusterClientContext);
  const workerPools = useResource(
    async () => {
      const workerManager = createTaskclusterClient({ Class: WorkerManager });
      const queue = createTaskclusterClient({ Class: Queue });
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
      const statsByPool = new Map(
        stats.map(poolStats => [poolStats.workerPoolId, poolStats])
      );
      const pendingTasks = await fetchPendingTasks(
        queue,
        pools.map(({ workerPoolId }) => workerPoolId)
      );

      return pools.map(pool => ({
        ...pool,
        ...statsByPool.get(pool.workerPoolId),
        pendingTasks: pendingTasks.get(pool.workerPoolId),
      }));
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
  const { reload: reloadWorkerPools } = workerPools;

  useEffect(() => {
    const interval = setInterval(reloadWorkerPools, REFRESH_INTERVAL);

    return () => clearInterval(interval);
  }, [reloadWorkerPools]);

  return (
    <StatusDashboard
      workerPools={asStats(workerPools)}
      provisioners={asStats(provisioners)}
      hookGroups={asStats(hookGroups)}
      clients={asStats(clients)}
      secrets={asStats(secrets)}
      roles={asStats(roles)}
      wmStats={asStats(wmStats)}
    />
  );
}
