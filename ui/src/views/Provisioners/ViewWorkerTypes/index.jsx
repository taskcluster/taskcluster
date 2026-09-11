import React, { Component, Fragment } from 'react';
import { Queue } from '@taskcluster/client-web';
import Typography from '@material-ui/core/Typography';
import { withStyles } from '@material-ui/core/styles';
import MenuItem from '@material-ui/core/MenuItem';
import Spinner from '../../../components/Spinner';
import TextField from '../../../components/TextField';
import WorkerTypesTable from '../../../components/WorkerTypesTable';
import Dashboard from '../../../components/Dashboard';
import ErrorPanel from '../../../components/ErrorPanel';
import Breadcrumbs from '../../../components/Breadcrumbs';
import Link from '../../../utils/Link';
import withPaginatedResource from '../../../hocs/withPaginatedResource';
import { VIEW_WORKER_TYPES_PAGE_SIZE } from '../../../utils/constants';
import { withTaskclusterClient } from '../../../utils/TaskclusterClient';

const PENDING_TASKS_CONCURRENCY = 30;

@withStyles(theme => ({
  bar: {
    display: 'flex',
    alignItems: 'center',
  },
  breadcrumbsPaper: {
    marginRight: theme.spacing(4),
    flex: 1,
  },
  dropdown: {
    minWidth: 200,
  },
  link: {
    ...theme.mixins.link,
  },
}))
@withTaskclusterClient
@withPaginatedResource({
  fetch:
    props =>
    ({ provisionerId, ...options }) =>
      props
        .createTaskclusterClient({ Class: Queue })
        .listWorkerTypes(props.match.params.provisionerId, options),
  // provisionerId is included so the query re-runs when the dropdown changes;
  // it is stripped back out in `fetch` before hitting the client.
  payload: props => ({
    provisionerId: props.match.params.provisionerId,
    limit: VIEW_WORKER_TYPES_PAGE_SIZE,
  }),
  select: response => response.workerTypes,
})
export default class ViewWorkerTypes extends Component {
  state = {
    provisioners: [],
    pendingTasks: {},
  };

  // Guards against out-of-order pendingTasks responses when the worker-type
  // page changes while a batch of per-row lookups is still in flight.
  pendingTasksRequestId = 0;

  async componentDidMount() {
    await this.fetchProvisioners();
    this.fetchPendingTasks();
  }

  componentDidUpdate(prevProps) {
    // `items` only gets a new reference when the paginated resource resolves a
    // new page (or provisioner); our own setState calls keep the same one.
    if (prevProps.items !== this.props.items) {
      this.fetchPendingTasks();
    }
  }

  componentWillUnmount() {
    // Prevent a completed request from calling setState after unmount, and stop
    // additional batches from starting.
    this.pendingTasksRequestId++;
  }

  get queue() {
    return this.props.createTaskclusterClient({ Class: Queue });
  }

  fetchProvisioners = async () => {
    try {
      const { provisioners } = await this.queue.listProvisioners();

      this.setState({ provisioners });
    } catch {
      // The dropdown just stays empty; the table error panel covers real
      // failures on this page.
    }
  };

  fetchPendingTasks = async () => {
    const requestId = ++this.pendingTasksRequestId;
    const { queue } = this;
    const keys = [
      ...new Set(
        this.props.items.map(
          ({ taskQueueId, provisionerId, workerType }) =>
            taskQueueId || `${provisionerId}/${workerType}`
        )
      ),
    ];
    const entries = [];

    this.setState({ pendingTasks: {} });

    for (
      let start = 0;
      start < keys.length;
      start += PENDING_TASKS_CONCURRENCY
    ) {
      if (requestId !== this.pendingTasksRequestId) {
        return;
      }

      const batch = keys.slice(start, start + PENDING_TASKS_CONCURRENCY);
      const results = await Promise.all(
        batch.map(async key => {
          try {
            const { pendingTasks } = await queue.taskQueueCounts(key);

            return [key, pendingTasks];
          } catch {
            // null (as opposed to a missing entry, which means "still
            // loading") tells the table to render n/a for this row.
            return [key, null];
          }
        })
      );

      entries.push(...results);
      // intermediate state
      this.setState({ pendingTasks: Object.fromEntries(entries) });
    }

    if (requestId !== this.pendingTasksRequestId) {
      return;
    }

    // plus one final
    this.setState({ pendingTasks: Object.fromEntries(entries) });
  };

  handleProvisionerChange = ({ target }) => {
    this.props.history.push(`/provisioners/${target.value}/worker-types`);
  };

  render() {
    const {
      classes,
      match: {
        params: { provisionerId },
      },
      items,
      loading,
      error,
      page,
      hasNextPage,
      hasPreviousPage,
      nextPage,
      previousPage,
    } = this.props;
    const { provisioners, pendingTasks } = this.state;
    const workerTypes = items.map(workerType => ({
      ...workerType,
      pendingTasks:
        pendingTasks[
          workerType.taskQueueId ||
            `${workerType.provisionerId}/${workerType.workerType}`
        ],
    }));
    // Separates the first load, which has nothing to show yet, from paging,
    // where the table stays up and the pagination row spins.
    const initialLoad = loading && !items.length;

    return (
      <Dashboard title="Worker Types">
        {initialLoad && <Spinner loading />}
        <ErrorPanel fixed error={error} />
        {!initialLoad && (
          <Fragment>
            <div className={classes.bar}>
              <Breadcrumbs classes={{ paper: classes.breadcrumbsPaper }}>
                <Link to="/provisioners">
                  <Typography variant="body2" className={classes.link}>
                    Workers
                  </Typography>
                </Link>
                <Typography variant="body2" color="textSecondary">
                  {`${provisionerId}`}
                </Typography>
              </Breadcrumbs>
              <TextField
                disabled={loading}
                className={classes.dropdown}
                select
                label="Provisioner ID"
                value={provisionerId}
                onChange={this.handleProvisionerChange}>
                <MenuItem value="">
                  <em>None</em>
                </MenuItem>
                {provisioners.map(({ provisionerId: id }) => (
                  <MenuItem key={id} value={id}>
                    {id}
                  </MenuItem>
                ))}
              </TextField>
            </div>
            <br />
            <WorkerTypesTable
              workerTypes={workerTypes}
              loading={loading}
              page={page}
              hasNextPage={hasNextPage}
              hasPreviousPage={hasPreviousPage}
              onNextPage={nextPage}
              onPreviousPage={previousPage}
            />
          </Fragment>
        )}
      </Dashboard>
    );
  }
}
