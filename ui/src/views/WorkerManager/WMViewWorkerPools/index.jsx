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
import fetchTaskQueueCounts from '../../../utils/fetchTaskQueueCounts';
import {
  NULL_PROVIDER,
  VIEW_WORKER_POOLS_PAGE_SIZE,
} from '../../../utils/constants';

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
    taskQueueCounts: null,
    taskQueueCountsError: null,
  };

  // Guards against out-of-order responses when the worker-pool page changes.
  taskQueueCountsRequestId = 0;

  componentDidMount() {
    this.loadErrorStats();
    this.loadTaskQueueCounts();
  }

  componentDidUpdate(prevProps) {
    if (
      this.poolIdsKey(prevProps.items) !== this.poolIdsKey(this.props.items)
    ) {
      this.loadTaskQueueCounts();
    }
  }

  componentWillUnmount() {
    // Prevent a completed request from calling setState after unmount.
    this.taskQueueCountsRequestId++;
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

  loadTaskQueueCounts = async () => {
    const requestId = ++this.taskQueueCountsRequestId;
    const workerPoolIds = [
      ...new Set(this.props.items.map(({ workerPoolId }) => workerPoolId)),
    ];

    if (!workerPoolIds.length) {
      this.setState({ taskQueueCounts: null, taskQueueCountsError: null });

      return;
    }

    this.setState({ taskQueueCounts: {}, taskQueueCountsError: null });

    const queue = this.props.createTaskclusterClient({ Class: Queue });

    try {
      const counts = await fetchTaskQueueCounts(queue, workerPoolIds);

      if (requestId !== this.taskQueueCountsRequestId) {
        return;
      }

      this.setState({
        taskQueueCounts: Object.fromEntries(
          counts.map(({ taskQueueId, pendingTasks, claimedTasks }) => [
            taskQueueId,
            { pendingTasks, claimedTasks },
          ])
        ),
        taskQueueCountsError: null,
      });
    } catch (error) {
      if (requestId !== this.taskQueueCountsRequestId) {
        return;
      }

      this.setState({
        taskQueueCounts: Object.fromEntries(
          workerPoolIds.map(workerPoolId => [
            workerPoolId,
            { pendingTasks: null, claimedTasks: null },
          ])
        ),
        taskQueueCountsError: error,
      });
    }
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
    const { errorStats, taskQueueCounts } = this.state;
    const { searchTerm } = this;
    const needle = searchTerm?.toLowerCase();
    const workerPools = needle
      ? items.filter(({ workerPoolId }) =>
          workerPoolId.toLowerCase().includes(needle)
        )
      : items;

    return workerPools.map(workerPool => {
      const counts = taskQueueCounts?.[workerPool.workerPoolId];

      return {
        ...workerPool,
        errorsCount:
          errorStats?.totals?.workerPool?.[workerPool.workerPoolId] || 0,
        pendingTasks: counts?.pendingTasks,
        claimedTasks: counts?.claimedTasks,
      };
    });
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
    const { errorStatsError, errorStatsLoading, taskQueueCountsError } =
      this.state;
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
        <ErrorPanel
          warning
          error={
            taskQueueCountsError &&
            // An InsufficientScopes message lists two scopes per pool.
            `Failed to load task queue counts${
              taskQueueCountsError.code ? ` (${taskQueueCountsError.code})` : ''
            }. Counts require the queue:pending-count and queue:claimed-count ` +
              `scopes for every worker pool listed here.`
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
