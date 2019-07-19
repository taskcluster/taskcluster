import React, { Component } from 'react';
import { CopyToClipboard } from 'react-copy-to-clipboard';
import TableCell from '@material-ui/core/TableCell';
import TableRow from '@material-ui/core/TableRow';
import Typography from '@material-ui/core/Typography';
import ListItemText from '@material-ui/core/ListItemText';
import { camelCase } from 'change-case';
import memoize from 'fast-memoize';
import LinkIcon from 'mdi-react/LinkIcon';
import { withStyles } from '@material-ui/core/styles';
import ContentCopyIcon from 'mdi-react/ContentCopyIcon';
import InheritMaterialUI from '../InheritMaterialUI';
import DateDistance from '../DateDistance';
import DataTable from '../DataTable';
import StatusLabel from '../StatusLabel';
import { worker } from '../../utils/prop-types';
import sort from '../../utils/sort';
import Link from '../../utils/Link';

@withStyles(theme => ({
  dateListItem: {
    marginLeft: -theme.spacing.unit,
    padding: theme.spacing.unit,
  },
  taskName: {
    marginRight: theme.spacing.unit,
    maxWidth: 250,
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    verticalAlign: 'middle',
    display: 'inline-block',
  },
  infoButton: {
    marginLeft: -theme.spacing.double,
    marginRight: theme.spacing.unit,
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
      const sortByProperty = camelCase(sortBy);

      if (!worker) {
        return null;
      }

      const tasks = worker.recentTasks.reduce(
        (tasks, recentTask, index) =>
          tasks.concat({
            ...recentTask.run,
            ...worker.latestTasks[index].metadata,
          }),
        []
      );

      if (!sortBy) {
        return tasks;
      }

      return tasks.sort((a, b) => {
        const firstElement =
          sortDirection === 'desc' ? b[sortByProperty] : a[sortByProperty];
        const secondElement =
          sortDirection === 'desc' ? a[sortByProperty] : b[sortByProperty];

        return sort(firstElement, secondElement);
      });
    },
    {
      serializer: ({ sortBy, sortDirection }) => `${sortBy}-${sortDirection}`,
    }
  );

  handleHeaderClick = sortBy => {
    const toggled = this.state.sortDirection === 'desc' ? 'asc' : 'desc';
    const sortDirection = this.state.sortBy === sortBy ? toggled : 'desc';

    this.setState({ sortBy, sortDirection });
  };

  render() {
    const { classes, worker } = this.props;
    const { sortBy, sortDirection } = this.state;
    const iconSize = 16;
    const items = this.getTableData({ sortBy, sortDirection, worker });

    return (
      <DataTable
        items={items}
        renderRow={task => (
          <TableRow key={`recent-task-${task.taskId}`}>
            <TableCell>
              <StatusLabel state={task.state} />
            </TableCell>
            <TableCell>
              <InheritMaterialUI
                button
                component={Link}
                to={`/tasks/${task.taskId}/runs/${task.runId}`}>
                <div className={classes.taskName}>{task.name}</div>
                <LinkIcon size={iconSize} />
              </InheritMaterialUI>
            </TableCell>
            <TableCell>{task.taskId}</TableCell>
            <CopyToClipboard title={task.started} text={task.started}>
              <TableCell>
                <InheritMaterialUI>
                  <ListItemText
                    disableTypography
                    primary={
                      <Typography>
                        <DateDistance from={task.started} />
                      </Typography>
                    }
                  />
                  <ContentCopyIcon size={iconSize} />
                </InheritMaterialUI>
              </TableCell>
            </CopyToClipboard>
            <CopyToClipboard title={task.resolved} text={task.resolved}>
              <TableCell>
                {task.resolved ? (
                  <InheritMaterialUI>
                    <ListItemText
                      disableTypography
                      primary={
                        <Typography>
                          <DateDistance from={task.resolved} />
                        </Typography>
                      }
                    />
                    <ContentCopyIcon size={iconSize} />
                  </InheritMaterialUI>
                ) : (
                  <Typography>n/a</Typography>
                )}
              </TableCell>
            </CopyToClipboard>
          </TableRow>
        )}
        headers={['State', 'Name', 'Task ID', 'Started', 'Resolved']}
        sortByHeader={sortBy}
        sortDirection={sortDirection}
        onHeaderClick={this.handleHeaderClick}
      />
    );
  }
}
