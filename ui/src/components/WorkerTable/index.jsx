import React, { Component } from 'react';
import TableCell from '@material-ui/core/TableCell';
import TableRow from '@material-ui/core/TableRow';
import memoize from 'fast-memoize';
import LinkIcon from 'mdi-react/LinkIcon';
import { withStyles } from '@material-ui/core/styles';
import CopyToClipboardTableCell from '../CopyToClipboardTableCell';
import TableCellItem from '../TableCellItem';
import DateDistance from '../DateDistance';
import DataTable from '../DataTable';
import StatusLabel from '../StatusLabel';
import { worker } from '../../utils/prop-types';
import sort from '../../utils/sort';
import Link from '../../utils/Link';

@withStyles(theme => ({
  dateListItem: {
    marginLeft: -theme.spacing(1),
    padding: theme.spacing(1),
  },
  taskName: {
    marginRight: theme.spacing(1),
    maxWidth: 250,
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    verticalAlign: 'middle',
    display: 'inline-block',
  },
  infoButton: {
    marginLeft: -theme.spacing(2),
    marginRight: theme.spacing(1),
  },
}))
/**
 * Display relevant information about a worker in a table.
 */
export default class WorkerTable extends Component {
  static defaultProps = {
    worker: null,
  };

  static propTypes = {
    /** A GraphQL worker response. */
    worker,
  };

  state = {
    sortBy: null,
    sortDirection: null,
  };

  getTableData = memoize(
    ({ sortBy, sortDirection, worker }) => {
      if (!worker) {
        return null;
      }

      const tasks = worker.recentTasks.reduce(
        (tasks, recentTask, index) =>
          tasks.concat({
            // Sometimes a run expires so we try to get at least the taskId
            ...(recentTask.taskId ? { taskId: recentTask.taskId } : null),
            ...recentTask.run,
            ...(worker.latestTasks[index]
              ? worker.latestTasks[index].metadata
              : null),
          }),
        []
      );

      if (!sortBy) {
        return tasks;
      }

      return tasks.sort((a, b) => {
        const firstElement = sortDirection === 'desc' ? b[sortBy] : a[sortBy];
        const secondElement = sortDirection === 'desc' ? a[sortBy] : b[sortBy];

        return sort(firstElement, secondElement);
      });
    },
    {
      serializer: ({ sortBy, sortDirection }) => `${sortBy}-${sortDirection}`,
    }
  );

  handleHeaderClick = header => {
    const toggled = this.state.sortDirection === 'desc' ? 'asc' : 'desc';
    const sortDirection = this.state.sortBy === header.id ? toggled : 'desc';

    this.setState({ sortBy: header.id, sortDirection });
  };

  render() {
    const { classes, worker } = this.props;
    const { sortBy, sortDirection } = this.state;
    const iconSize = 16;
    const items = this.getTableData({ sortBy, sortDirection, worker });
    const headers = [
      { label: 'State', id: 'state', type: 'string' },
      {
        label: 'Name',
        id: 'name',
        type: 'string',
      },
      {
        label: 'Task ID',
        id: 'taskId',
        type: 'string',
      },
      {
        label: 'Started',
        id: 'started',
        type: 'string',
      },

      {
        label: 'Resolved',
        id: 'resolved',
        type: 'string',
      },
    ];

    return (
      <DataTable
        items={items}
        renderRow={task => (
          <TableRow key={`recent-task-${task.taskId}`}>
            <TableCell>
              {task.state ? <StatusLabel state={task.state} /> : <em>n/a</em>}
            </TableCell>
            <TableCell>
              {task.name ? (
                <Link to={`/tasks/${task.taskId}/runs/${task.runId}`}>
                  <TableCellItem button>
                    <div className={classes.taskName}>{task.name}</div>
                    <LinkIcon size={iconSize} />
                  </TableCellItem>
                </Link>
              ) : (
                <em>n/a</em>
              )}
            </TableCell>
            <TableCell>{task.taskId}</TableCell>
            {task.started ? (
              <CopyToClipboardTableCell
                tooltipTitle={task.started}
                textToCopy={task.started}
                text={<DateDistance from={task.started} />}
              />
            ) : (
              <TableCell>
                <em>n/a</em>
              </TableCell>
            )}
            {task.resolved ? (
              <CopyToClipboardTableCell
                tooltipTitle={task.resolved}
                textToCopy={task.resolved}
                text={<DateDistance from={task.resolved} />}
              />
            ) : (
              <TableCell>
                <em>n/a</em>
              </TableCell>
            )}
          </TableRow>
        )}
        headers={headers}
        sortByLabel={sortBy}
        sortDirection={sortDirection}
        onHeaderClick={this.handleHeaderClick}
      />
    );
  }
}
