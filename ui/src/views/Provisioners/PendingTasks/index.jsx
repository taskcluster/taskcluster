import React, { Component } from 'react';
import { Queue, WorkerManager } from '@taskcluster/client-web';
import { TableRow, TableCell, Box, Typography } from '@material-ui/core';
import LinkIcon from 'mdi-react/LinkIcon';
import Spinner from '../../../components/Spinner';
import Dashboard from '../../../components/Dashboard';
import { VIEW_WORKER_POOL_PENDING_TASKS_PAGE_SIZE } from '../../../utils/constants';
import PaginatedDataTable from '../../../components/PaginatedDataTable';
import Link from '../../../utils/Link';
import TableCellItem from '../../../components/TableCellItem';
import DateDistance from '../../../components/DateDistance';
import Label from '../../../components/Label';
import Breadcrumbs from '../../../components/Breadcrumbs';
import ErrorPanel from '../../../components/ErrorPanel';
import { joinWorkerPoolId } from '../../../utils/workerPool';
import WorkersNavbar from '../../../components/WorkersNavbar';
import CopyToClipboardTableCell from '../../../components/CopyToClipboardTableCell';
import withPaginatedResource from '../../../hocs/withPaginatedResource';
import { withTaskclusterClient } from '../../../utils/TaskclusterClient';

@withTaskclusterClient
@withPaginatedResource({
  fetch:
    props =>
    ({ taskQueueId, ...options }) =>
      props
        .createTaskclusterClient({ Class: Queue })
        .listPendingTasks(taskQueueId, options),
  // taskQueueId is included so the query re-runs when the route changes;
  // it is stripped back out in `fetch` before hitting the client.
  payload: props => ({
    taskQueueId: joinWorkerPoolId(
      props.match.params.provisionerId,
      props.match.params.workerType
    ),
    limit: VIEW_WORKER_POOL_PENDING_TASKS_PAGE_SIZE,
  }),
  select: response => response.tasks ?? [],
})
export default class WMViewPendingTasks extends Component {
  state = {
    workerPool: null,
  };

  componentDidMount() {
    this.fetchWorkerPool();
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
  }

  get workersLink() {
    const { provisionerId, workerType } = this.props.match.params;

    return `/provisioners/${provisionerId}/worker-types/${workerType}`;
  }

  // Pending tasks may exist for pools not managed by worker-manager. A missing
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

  renderRow = ({ taskId, runId, inserted, task }, style, key) => {
    return (
      <TableRow key={key ?? taskId} style={style}>
        <TableCell>
          <Link to={`/tasks/${taskId}`}>
            <TableCellItem button>
              {taskId}
              <LinkIcon size={16} />
            </TableCellItem>
          </Link>
        </TableCell>
        <TableCell>{runId}</TableCell>
        <TableCell>
          <Label mini status="info">
            {task.priority}
          </Label>
        </TableCell>
        <CopyToClipboardTableCell
          tooltipTitle={inserted}
          textToCopy={inserted}
          text={<DateDistance from={inserted} />}
        />
        <TableCell>{task.metadata?.name}</TableCell>
      </TableRow>
    );
  };

  render() {
    const {
      items,
      loading,
      error,
      page,
      hasNextPage,
      hasPreviousPage,
      nextPage,
      previousPage,
    } = this.props;
    const { provisionerId, workerType } = this.props.match.params;
    const { workerPool } = this.state;
    // Separates the first load, which has nothing to show yet, from paging,
    // where the table stays up and the pagination row spins.
    const initialLoad = loading && !items.length;

    return (
      <Dashboard
        title={`Pending tasks in "${provisionerId}/${workerType}"`}
        disableTitleFormatting>
        <Box
          sx={{
            display: 'flex',
            flexWrap: 'wrap',
            alignItems: 'center',
            width: '100%',
          }}>
          <div style={{ flexGrow: 1, marginRight: 8 }}>
            <Breadcrumbs>
              <Link to="/provisioners">
                <Typography variant="body2">Workers</Typography>
              </Link>
              <Link to={`/provisioners/${provisionerId}`}>
                <Typography variant="body2">{provisionerId}</Typography>
              </Link>
              <Link
                to={`/provisioners/${provisionerId}/worker-types/${workerType}`}>
                <Typography variant="body2">{workerType}</Typography>
              </Link>
              <WorkersNavbar
                provisionerId={provisionerId}
                workerType={workerType}
                hasWorkerPool={!!workerPool?.workerPoolId}
              />
            </Breadcrumbs>
          </div>
        </Box>

        {initialLoad && <Spinner loading />}

        <ErrorPanel fixed error={error} />

        {!initialLoad && (
          <PaginatedDataTable
            noItemsMessage="No pending tasks"
            items={items}
            pageSize={VIEW_WORKER_POOL_PENDING_TASKS_PAGE_SIZE}
            page={page}
            loading={loading}
            hasNextPage={hasNextPage}
            hasPreviousPage={hasPreviousPage}
            onNextPage={nextPage}
            onPreviousPage={previousPage}
            renderRow={this.renderRow}
            headers={['Task ID', 'Run ID', 'Priority', 'Scheduled', 'Title']}
          />
        )}
      </Dashboard>
    );
  }
}
