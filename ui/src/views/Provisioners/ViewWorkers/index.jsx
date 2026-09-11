import React, { Component, Fragment } from 'react';
import { Queue, WorkerManager } from '@taskcluster/client-web';
import { parse, stringify } from 'qs';
import Typography from '@material-ui/core/Typography';
import { withStyles } from '@material-ui/core/styles';
import MenuItem from '@material-ui/core/MenuItem';
import { Box } from '@material-ui/core';
import Spinner from '../../../components/Spinner';
import TextField from '../../../components/TextField';
import WorkersTable from '../../../components/WorkersTable';
import Dashboard from '../../../components/Dashboard';
import { VIEW_WORKERS_PAGE_SIZE } from '../../../utils/constants';
import { joinWorkerPoolId } from '../../../utils/workerPool';
import ErrorPanel from '../../../components/ErrorPanel';
import Breadcrumbs from '../../../components/Breadcrumbs';
import Link from '../../../utils/Link';
import WorkersNavbar from '../../../components/WorkersNavbar';
import withPaginatedResource from '../../../hocs/withPaginatedResource';
import { withTaskclusterClient } from '../../../utils/TaskclusterClient';

const STATES = {
  running: 'running',
  stopping: 'stopping',
  stopped: 'stopped',
};

@withStyles(theme => ({
  bar: {
    display: 'flex',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: theme.spacing(2),
  },
  breadcrumbsPaper: {
    marginRight: theme.spacing(2),
    flex: 1,
  },
  dropdown: {
    minWidth: 200,
    marginTop: 0,
  },
  link: {
    ...theme.mixins.link,
  },
}))
@withTaskclusterClient
@withPaginatedResource({
  fetch:
    props =>
    ({ provisionerId, workerType, ...options }) =>
      props
        .createTaskclusterClient({ Class: WorkerManager })
        .listWorkers(
          props.match.params.provisionerId,
          props.match.params.workerType,
          options
        ),
  // provisionerId/workerType are included so the query re-runs when the
  // route changes, and filterBy so it re-runs (and resets to page 0) when
  // the dropdown changes; they're stripped back out in `fetch` before
  // hitting the client.
  payload: props => {
    const { filterBy } = parse(props.location.search.slice(1));

    return {
      provisionerId: props.match.params.provisionerId,
      workerType: props.match.params.workerType,
      limit: VIEW_WORKERS_PAGE_SIZE,
      quarantined: filterBy === 'quarantined' ? true : undefined,
      workerState: Object.values(STATES).includes(filterBy)
        ? filterBy
        : undefined,
    };
  },
  select: response => response.workers ?? [],
})
export default class ViewWorkers extends Component {
  state = {
    workerPool: null,
    latestTaskRuns: {},
  };

  // Guards against out-of-order latestTaskRuns responses when the page or
  // filter changes while a batch of per-worker lookups is still in flight.
  latestTaskRunsRequestId = 0;

  componentDidMount() {
    this.fetchWorkerPool();
    this.fetchLatestTaskRuns();
  }

  componentDidUpdate(prevProps) {
    const { params } = this.props.match;
    const { params: prevParams } = prevProps.match;

    if (
      params.provisionerId !== prevParams.provisionerId ||
      params.workerType !== prevParams.workerType
    ) {
      this.fetchWorkerPool();
    }

    // `items` only gets a new reference when the paginated resource resolves
    // a new page (or query); our own setState calls keep the same one.
    if (prevProps.items !== this.props.items) {
      this.fetchLatestTaskRuns();
    }
  }

  get queue() {
    return this.props.createTaskclusterClient({ Class: Queue });
  }

  // Workers may exist for pools not managed by worker-manager. A missing
  // worker pool just trims the worker-manager-only nav items, so the lookup
  // failure is swallowed rather than surfaced as an error.
  fetchWorkerPool = async () => {
    const { provisionerId, workerType } = this.props.match.params;
    const workerPoolId = joinWorkerPoolId(provisionerId, workerType);

    try {
      const workerPool = await this.props
        .createTaskclusterClient({ Class: WorkerManager })
        .workerPool(workerPoolId);

      this.setState({ workerPool });
    } catch {
      this.setState({ workerPool: null });
    }
  };

  // Replaces the GraphQL resolver that decorated each worker's latestTask
  // with its run status. The REST worker's `latestTask` only carries
  // `{ taskId, runId }`, so the run's state/started/resolved is fetched per
  // worker here.
  fetchLatestTaskRuns = async () => {
    const workers = this.props.items;
    const requestId = ++this.latestTaskRunsRequestId;
    const { queue } = this;
    const entries = await Promise.all(
      workers
        .filter(({ latestTask }) => latestTask)
        .map(async ({ latestTask }) => {
          const key = `${latestTask.taskId}.${latestTask.runId}`;

          try {
            const { status } = await queue.status(latestTask.taskId);

            return [key, status.runs?.[latestTask.runId]];
          } catch {
            return [key, undefined];
          }
        })
    );

    if (requestId !== this.latestTaskRunsRequestId) {
      return;
    }

    this.setState({ latestTaskRuns: Object.fromEntries(entries) });
  };

  handleFilterChange = ({ target }) => {
    const {
      location,
      history,
      match: {
        params: { provisionerId, workerType },
      },
    } = this.props;
    const query = parse(location.search.slice(1));

    if (target.value) {
      query.filterBy = target.value;
    } else {
      delete query.filterBy;
    }

    history.replace(
      `/provisioners/${provisionerId}/worker-types/${workerType}${stringify(
        query,
        { addQueryPrefix: true }
      )}`
    );
  };

  render() {
    const {
      location,
      classes,
      match: { params },
      items,
      loading,
      error,
      page,
      hasNextPage,
      hasPreviousPage,
      nextPage,
      previousPage,
    } = this.props;
    const { workerPool, latestTaskRuns } = this.state;
    const query = parse(location.search.slice(1));
    const workers = items.map(worker => ({
      ...worker,
      latestTask: worker.latestTask
        ? {
            run: {
              taskId: worker.latestTask.taskId,
              runId: worker.latestTask.runId,
              ...latestTaskRuns[
                `${worker.latestTask.taskId}.${worker.latestTask.runId}`
              ],
            },
          }
        : null,
    }));
    // Separates the first load, which has nothing to show yet, from paging,
    // where the table stays up and the pagination row spins.
    const initialLoad = loading && !items.length;

    return (
      <Dashboard title="Workers">
        {initialLoad && <Spinner loading />}
        <ErrorPanel fixed error={error} />
        {!initialLoad && (
          <Fragment>
            <Box className={classes.bar}>
              <Breadcrumbs classes={{ paper: classes.breadcrumbsPaper }}>
                <Link to="/provisioners">
                  <Typography variant="body2" className={classes.link}>
                    Workers
                  </Typography>
                </Link>
                <Link to={`/provisioners/${params.provisionerId}`}>
                  <Typography variant="body2" className={classes.link}>
                    {params.provisionerId}
                  </Typography>
                </Link>
                <Typography variant="body2" color="textSecondary">
                  {`${params.workerType}`}
                </Typography>
                <WorkersNavbar
                  provisionerId={params.provisionerId}
                  workerType={params.workerType}
                  hasWorkerPool={!!workerPool?.workerPoolId}
                />
              </Breadcrumbs>

              <Box marginTop={-2}>
                <TextField
                  disabled={loading}
                  className={classes.dropdown}
                  select
                  label="Filter By"
                  value={query.filterBy || ''}
                  onChange={this.handleFilterChange}>
                  <MenuItem value="">
                    <em>None</em>
                  </MenuItem>
                  <MenuItem value="quarantined">Quarantined</MenuItem>
                  <MenuItem value="running">Running</MenuItem>
                  <MenuItem value="stopping">Stopping</MenuItem>
                  <MenuItem value="stopped">Stopped</MenuItem>
                </TextField>
              </Box>
            </Box>
            <br />
            <WorkersTable
              workers={workers}
              loading={loading}
              page={page}
              hasNextPage={hasNextPage}
              hasPreviousPage={hasPreviousPage}
              onNextPage={nextPage}
              onPreviousPage={previousPage}
              workerType={params.workerType}
              provisionerId={params.provisionerId}
            />
          </Fragment>
        )}
      </Dashboard>
    );
  }
}
