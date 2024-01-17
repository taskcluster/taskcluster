import React, { Component } from 'react';
import { graphql } from 'react-apollo';
import dotProp from 'dot-prop-immutable';
import { TableRow, TableCell, Chip, Box, Typography } from '@material-ui/core';
import LinkIcon from 'mdi-react/LinkIcon';
import WorkerIcon from 'mdi-react/WorkerIcon';
import ProgressClockIcon from 'mdi-react/ProgressClockIcon';
import Spinner from '../../../components/Spinner';
import Dashboard from '../../../components/Dashboard';
import { VIEW_WORKER_POOL_PENDING_TASKS_PAGE_SIZE } from '../../../utils/constants';
import pendingTasks from './pendingTasks.graphql';
import ConnectionDataTable from '../../../components/ConnectionDataTable';
import Link from '../../../utils/Link';
import TableCellItem from '../../../components/TableCellItem';
import DateDistance from '../../../components/DateDistance';
import Label from '../../../components/Label';
import Breadcrumbs from '../../../components/Breadcrumbs';
import ErrorPanel from '../../../components/ErrorPanel';

@graphql(pendingTasks, {
  options: props => ({
    variables: {
      taskQueueId: `${props.match.params.provisionerId}/${props.match.params.workerType}`,
      connection: {
        limit: VIEW_WORKER_POOL_PENDING_TASKS_PAGE_SIZE,
      },
    },
  }),
})
export default class WMViewPendingTasks extends Component {
  handlePageChange = ({ cursor, previousCursor }) => {
    const {
      data: { fetchMore },
      match: { params },
    } = this.props;

    return fetchMore({
      query: pendingTasks,
      variables: {
        taskQueueId: `${params.provisionerId}/${params.workerType}`,
        connection: {
          limit: VIEW_WORKER_POOL_PENDING_TASKS_PAGE_SIZE,
          cursor,
          previousCursor,
        },
      },
      updateQuery(previousResult, { fetchMoreResult: { listPendingTasks } }) {
        // use dotProp.set to avoid lint warning about assigning to properties
        return dotProp.set(
          previousResult,
          'listPendingTasks',
          listPendingTasks
        );
      },
    });
  };

  get workersLink() {
    const { provisionerId, workerType } = this.props.match.params;

    return `/provisioners/${provisionerId}/worker-types/${workerType}`;
  }

  renderRow({ node: { taskId, runId, inserted, task } }) {
    return (
      <TableRow key={taskId}>
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
        <TableCell>
          <DateDistance from={new Date(inserted)} />
        </TableCell>
        <TableCell>{task.metadata?.name}</TableCell>
      </TableRow>
    );
  }

  render() {
    const {
      data: { loading, error, listPendingTasks },
    } = this.props;
    const { provisionerId, workerType } = this.props.match.params;

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
              <Typography variant="body2" color="textSecondary">
                Pending Tasks
              </Typography>
            </Breadcrumbs>
          </div>
          <div>
            <Chip
              size="medium"
              icon={<ProgressClockIcon />}
              label="View Claimed Tasks"
              component={Link}
              clickable
              to={`${this.workersLink}/claimed-tasks`}
              style={{ marginRight: 4 }}
            />
            <Chip
              size="medium"
              icon={<WorkerIcon />}
              label="Workers (Queue View)"
              component={Link}
              clickable
              to={this.workersLink}
            />
          </div>
        </Box>

        {loading && <Spinner loading />}

        {error && <ErrorPanel fixed error={error} />}

        {!error && !loading && (
          <ConnectionDataTable
            noItemsMessage="No pending tasks"
            connection={listPendingTasks}
            pageSize={VIEW_WORKER_POOL_PENDING_TASKS_PAGE_SIZE}
            renderRow={this.renderRow}
            onPageChange={this.handlePageChange}
            headers={['Task ID', 'Run ID', 'Priority', 'Scheduled', 'Title']}
          />
        )}
      </Dashboard>
    );
  }
}
