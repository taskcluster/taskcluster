import React, { Component } from 'react';
import { Queue, WorkerManager } from '@taskcluster/client-web';
import PlusIcon from 'mdi-react/PlusIcon';
import qs from 'qs';
import { withStyles } from '@material-ui/core/styles';
import Spinner from '../../../components/Spinner';
import Dashboard from '../../../components/Dashboard';
import ErrorPanel from '../../../components/ErrorPanel';
import WorkerManagerWorkerPoolsTable from '../../../components/WMWorkerPoolsTable';
import Search from '../../../components/Search';
import Button from '../../../components/Button';
import withPaginatedResource from '../../../hocs/withPaginatedResource';
import { withTaskclusterClient } from '../../../utils/TaskclusterClient';
import {
  NULL_PROVIDER,
  VIEW_WORKER_POOLS_PAGE_SIZE,
} from '../../../utils/constants';

const PENDING_TASKS_CONCURRENCY = 30;

/**
 * `listWorkerPools` and `listWorkerPoolsStats` are two endpoints over the same
 * ordered set of pools, so a page of one lines up with a page of the other.
 * This joins them the way the web-server resolver used to.
 */
const mergeStats = ({ workerPools, workerPoolsStats }) => {
  const statsByPool = new Map(
    (workerPoolsStats ?? []).map(stat => [stat.workerPoolId, stat])
  );

  return (workerPools ?? []).map(workerPool => ({
    ...workerPool,
    ...statsByPool.get(workerPool.workerPoolId),
  }));
};

@withStyles(theme => ({
  createIconSpan: {
    ...theme.mixins.fab,
    ...theme.mixins.actionButton,
  },
  toolbar: {
    display: 'flex',
    justifyContent: 'flex-end',
  },
}))
@withTaskclusterClient
@withPaginatedResource({
  fetch: props => async options => {
    const client = props.createTaskclusterClient({ Class: WorkerManager });
    const [pools, stats] = await Promise.all([
      client.listWorkerPools(options),
      client.listWorkerPoolsStats(options),
    ]);

    return { ...pools, workerPoolsStats: stats.workerPoolsStats };
  },
  payload: { limit: VIEW_WORKER_POOLS_PAGE_SIZE },
  select: mergeStats,
})
export default class WorkerManagerWorkerPoolsView extends Component {
  state = {
    errorStatsLoading: false,
    errorStats: null,
    errorStatsError: null,
    pendingTasks: null,
  };

  // Guards against out-of-order pendingTasks responses when the worker-pool
  // page changes while a batch of per-row lookups is still in flight.
  pendingTasksRequestId = 0;

  componentDidMount() {
    this.loadErrorStats();
    this.loadPendingTasks();
  }

  componentDidUpdate(prevProps) {
    if (
      this.poolIdsKey(prevProps.items) !== this.poolIdsKey(this.props.items)
    ) {
      this.loadPendingTasks();
    }
  }

  componentWillUnmount() {
    // Prevent a completed request from calling setState after unmount, and stop
    // additional batches from starting.
    this.pendingTasksRequestId++;
  }

  get searchTerm() {
    return qs.parse(this.props.location.search.slice(1)).search || null;
  }

  get workerManagerClient() {
    return this.props.createTaskclusterClient({ Class: WorkerManager });
  }

  poolIdsKey = (items = []) =>
    items.map(({ workerPoolId }) => workerPoolId).join(',');

  loadErrorStats = async () => {
    if (this.state.errorStatsLoading) {
      return;
    }

    this.setState({ errorStatsLoading: true });

    try {
      // No workerPoolId: one request covering every pool, keyed by pool id.
      const errorStats = await this.workerManagerClient.workerPoolErrorStats();

      this.setState({
        errorStats,
        errorStatsLoading: false,
        errorStatsError: null,
      });
    } catch (error) {
      this.setState({ errorStatsLoading: false, errorStatsError: error });
    }
  };

  loadPendingTasks = async () => {
    const requestId = ++this.pendingTasksRequestId;
    const workerPoolIds = [
      ...new Set(this.props.items.map(({ workerPoolId }) => workerPoolId)),
    ];

    if (!workerPoolIds.length) {
      this.setState({ pendingTasks: null });

      return;
    }

    this.setState({ pendingTasks: {} });

    // There is no batch endpoint for pending counts, so this is one request
    // per pool -- the same fan-out the web-server resolver did, moved into the
    // browser in bounded batches. A pool the user cannot read counts for is
    // left blank rather than failing the whole column.
    const queue = this.props.createTaskclusterClient({ Class: Queue });
    const counts = [];

    for (
      let start = 0;
      start < workerPoolIds.length;
      start += PENDING_TASKS_CONCURRENCY
    ) {
      if (requestId !== this.pendingTasksRequestId) {
        return;
      }

      const batch = workerPoolIds.slice(
        start,
        start + PENDING_TASKS_CONCURRENCY
      );
      const results = await Promise.all(
        batch.map(async workerPoolId => {
          try {
            // a worker pool id is also a task queue id
            const { pendingTasks } = await queue.pendingTasks(workerPoolId);

            return [workerPoolId, pendingTasks];
          } catch {
            return [workerPoolId, null];
          }
        })
      );

      if (requestId !== this.pendingTasksRequestId) {
        return;
      }

      counts.push(...results);
      this.setState({ pendingTasks: Object.fromEntries(counts) });
    }

    this.setState({
      pendingTasks: Object.fromEntries(counts),
    });
  };

  handleWorkerPoolSearchSubmit = workerPoolSearch => {
    const { history, location, reload } = this.props;

    if ((workerPoolSearch || null) === this.searchTerm) {
      reload();

      return;
    }

    history.push({
      search: qs.stringify({
        ...qs.parse(location.search.slice(1)),
        search: workerPoolSearch,
      }),
    });
  };

  handleCreate = () => {
    this.props.history.push(`${this.props.match.path}/create`);
  };

  deleteRequest = async ({ workerPoolId, payload }) => {
    await this.workerManagerClient.updateWorkerPool(workerPoolId, {
      ...payload,
      providerId: NULL_PROVIDER, // this is how we delete worker pools
    });

    this.props.reload();
  };

  getWorkerPools() {
    const { items } = this.props;
    const { errorStats, pendingTasks } = this.state;
    const { searchTerm } = this;
    const needle = searchTerm?.toLowerCase();
    const workerPools = needle
      ? items.filter(({ workerPoolId }) =>
          workerPoolId.toLowerCase().includes(needle)
        )
      : items;

    return workerPools.map(workerPool => ({
      ...workerPool,
      errorsCount:
        errorStats?.totals?.workerPool?.[workerPool.workerPoolId] || 0,
      pendingTasks: pendingTasks?.[workerPool.workerPoolId],
    }));
  }

  render() {
    const {
      classes,
      loading,
      error,
      items,
      page,
      hasNextPage,
      hasPreviousPage,
      nextPage,
      previousPage,
    } = this.props;
    const { errorStatsError, errorStatsLoading } = this.state;
    const { searchTerm } = this;
    const initialLoad = loading && !items.length;
    const workerPools = this.getWorkerPools();

    return (
      <Dashboard
        title="Worker Pools"
        search={
          <Search
            disabled={loading}
            defaultValue={searchTerm}
            onSubmit={this.handleWorkerPoolSearchSubmit}
            placeholder="Worker pool ID contains"
          />
        }>
        {initialLoad && <Spinner loading />}
        <ErrorPanel fixed error={error} />
        <ErrorPanel
          warning
          error={
            errorStatsError &&
            `Failed to load worker pool error stats: ${errorStatsError.message}`
          }
        />
        {!initialLoad && (
          <WorkerManagerWorkerPoolsTable
            workerPools={workerPools}
            searchTerm={searchTerm}
            deleteRequest={this.deleteRequest}
            errorStatsLoading={errorStatsLoading}
            loading={loading}
            page={page}
            hasNextPage={hasNextPage}
            hasPreviousPage={hasPreviousPage}
            onNextPage={nextPage}
            onPreviousPage={previousPage}
          />
        )}
        <Button
          spanProps={{ className: classes.createIconSpan }}
          tooltipProps={{ title: 'Create Worker Pool' }}
          requiresAuth
          color="secondary"
          variant="circular"
          onClick={this.handleCreate}>
          <PlusIcon />
        </Button>
      </Dashboard>
    );
  }
}
