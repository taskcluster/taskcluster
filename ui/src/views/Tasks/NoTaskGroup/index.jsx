import React, { Component } from 'react';
import { sum, values } from 'ramda';
import { withStyles } from '@material-ui/core/styles';
import Typography from '@material-ui/core/Typography';
import TableCell from '@material-ui/core/TableCell';
import TableRow from '@material-ui/core/TableRow';
import ListSubheader from '@material-ui/core/ListSubheader';
import LinkIcon from 'mdi-react/LinkIcon';
import Dashboard from '../../../components/Dashboard';
import HelpView from '../../../components/HelpView';
import Search from '../../../components/Search';
import DateDistance from '../../../components/DateDistance';
import StatusLabel from '../../../components/StatusLabel';
import DataTable from '../../../components/DataTable';
import TableCellItem from '../../../components/TableCellItem';
import Link from '../../../utils/Link';
import db from '../../../utils/db';
import sort from '../../../utils/sort';

const totalTasks = statusCount => sum(values(statusCount || {}));

@withStyles(theme => ({
  infoText: {
    marginBottom: theme.spacing(1),
  },
  // Let the table scroll rather than wrap a date/age fragment.
  nowrap: {
    whiteSpace: 'nowrap',
  },
}))
export default class NoTaskGroup extends Component {
  state = {
    recentTaskGroups: [],
    sortBy: null,
    sortDirection: null,
  };

  async componentDidMount() {
    const recentTaskGroups = await db.taskGroupIdsHistory
      .orderBy('viewedAt')
      .reverse()
      .limit(20)
      .toArray();

    this.setState({ recentTaskGroups });
  }

  handleTaskGroupSearchSubmit = taskGroupId => {
    this.props.history.push(`/tasks/groups/${taskGroupId}`);
  };

  handleHeaderClick = ({ id: sortBy }) => {
    const { sortBy: currentSortBy, sortDirection } = this.state;
    const toggled = sortDirection === 'desc' ? 'asc' : 'desc';

    this.setState({
      sortBy,
      sortDirection: currentSortBy === sortBy ? toggled : 'desc',
    });
  };

  sortedTaskGroups() {
    const { recentTaskGroups, sortBy, sortDirection } = this.state;

    if (!sortBy) {
      return recentTaskGroups;
    }

    // statusCount is an object; order it by total instead.
    const sortKey = entry =>
      sortBy === 'statusCount' ? totalTasks(entry.statusCount) : entry[sortBy];

    return [...recentTaskGroups].sort((a, b) =>
      sortDirection === 'desc'
        ? sort(sortKey(b), sortKey(a))
        : sort(sortKey(a), sortKey(b))
    );
  }

  renderStatusCell(statusCount) {
    const total = totalTasks(statusCount);

    if (!total) {
      return null;
    }

    const { failed, exception, running, pending, unscheduled } = statusCount;
    let resolvedState;

    if (running + pending + unscheduled > 0) {
      resolvedState = 'RUNNING';
    } else if (failed > 0 || exception > 0) {
      resolvedState = 'FAILED';
    } else {
      resolvedState = 'COMPLETED';
    }

    return (
      <span>
        {total} tasks <StatusLabel state={resolvedState} />
      </span>
    );
  }

  renderTaskGroupRow = ({
    taskGroupId,
    name,
    statusCount,
    taskQueueId,
    created,
    viewedAt,
  }) => {
    const { classes } = this.props;

    return (
      <TableRow key={taskGroupId}>
        <TableCell>
          <Link to={`/tasks/groups/${taskGroupId}`}>
            <TableCellItem>
              <code>{taskGroupId}</code>
              <span>
                <LinkIcon size={16} />
              </span>
            </TableCellItem>
          </Link>
        </TableCell>
        <TableCell>
          <Link to={`/tasks/groups/${taskGroupId}`}>{name || taskGroupId}</Link>
        </TableCell>
        <TableCell title="State recorded at view time; may be stale">
          {this.renderStatusCell(statusCount)}
        </TableCell>
        <TableCell>{taskQueueId || null}</TableCell>
        <TableCell className={classes.nowrap}>
          {created ? <DateDistance from={created} /> : null}
        </TableCell>
        <TableCell className={classes.nowrap}>
          {viewedAt ? (
            <span>
              viewed <DateDistance from={new Date(viewedAt)} />
            </span>
          ) : null}
        </TableCell>
      </TableRow>
    );
  };

  render() {
    const { classes, description } = this.props;
    const { sortBy, sortDirection } = this.state;
    const items = this.sortedTaskGroups();

    return (
      <Dashboard
        title="Task Groups"
        helpView={<HelpView description={description} />}
        search={
          <Search
            placeholder="Search Task Group ID"
            onSubmit={this.handleTaskGroupSearchSubmit}
          />
        }>
        <Typography variant="body2" className={classes.infoText}>
          Enter a task group ID in the search box
        </Typography>
        {Boolean(items.length) && (
          <React.Fragment>
            <ListSubheader component="div" disableGutters>
              Recent Task Groups
            </ListSubheader>
            <DataTable
              headers={[
                { id: 'taskGroupId', label: 'Task Group ID' },
                { id: 'name', label: 'Name' },
                { id: 'statusCount', label: 'Status' },
                { id: 'taskQueueId', label: 'Queue' },
                { id: 'created', label: 'Created' },
                { id: 'viewedAt', label: 'Viewed' },
              ]}
              items={items}
              renderRow={this.renderTaskGroupRow}
              onHeaderClick={this.handleHeaderClick}
              sortByLabel={sortBy}
              sortDirection={sortDirection}
            />
          </React.Fragment>
        )}
      </Dashboard>
    );
  }
}
