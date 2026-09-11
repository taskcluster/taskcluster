import React, { Component } from 'react';
import { withStyles } from '@material-ui/core/styles';
import TableCell from '@material-ui/core/TableCell';
import TableRow from '@material-ui/core/TableRow';
import Typography from '@material-ui/core/Typography';
import ListSubheader from '@material-ui/core/ListSubheader';
import LinkIcon from 'mdi-react/LinkIcon';
import Dashboard from '../../../components/Dashboard';
import HelpView from '../../../components/HelpView';
import Search from '../../../components/Search';
import DateDistance from '../../../components/DateDistance';
import StatusLabel from '../../../components/StatusLabel';
import DataTable from '../../../components/DataTable';
import TableCellItem from '../../../components/TableCellItem';
import db from '../../../utils/db';
import Link from '../../../utils/Link';
import sort from '../../../utils/sort';

@withStyles(theme => ({
  infoText: {
    marginBottom: theme.spacing(1),
  },
  // Let the table scroll rather than wrap a date/age fragment.
  nowrap: {
    whiteSpace: 'nowrap',
  },
}))
export default class NoTask extends Component {
  state = {
    recentTasks: [],
    sortBy: null,
    sortDirection: null,
  };

  async componentDidMount() {
    const recentTasks = await db.taskIdsHistory
      .orderBy('viewedAt')
      .reverse()
      .limit(20)
      .toArray();

    this.setState({ recentTasks });
  }

  handleTaskSearchSubmit = taskId => {
    this.props.history.push(`/tasks/${taskId}`);
  };

  handleHeaderClick = ({ id: sortBy }) => {
    const { sortBy: currentSortBy, sortDirection } = this.state;
    const toggled = sortDirection === 'desc' ? 'asc' : 'desc';

    this.setState({
      sortBy,
      sortDirection: currentSortBy === sortBy ? toggled : 'desc',
    });
  };

  sortedTasks() {
    const { recentTasks, sortBy, sortDirection } = this.state;

    if (!sortBy) {
      return recentTasks;
    }

    return [...recentTasks].sort((a, b) =>
      sortDirection === 'desc'
        ? sort(b[sortBy], a[sortBy])
        : sort(a[sortBy], b[sortBy])
    );
  }

  renderTaskRow = ({ taskId, name, state, taskQueueId, created, viewedAt }) => {
    const { classes } = this.props;

    return (
      <TableRow key={taskId}>
        <TableCell>
          <Link to={`/tasks/${taskId}`}>
            <TableCellItem>
              <code>{taskId}</code>
              <span>
                <LinkIcon size={16} />
              </span>
            </TableCellItem>
          </Link>
        </TableCell>
        <TableCell>
          <Link to={`/tasks/${taskId}`}>{name || taskId}</Link>
        </TableCell>
        <TableCell title="State recorded at view time; may be stale">
          {state ? <StatusLabel state={state} /> : null}
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
    const { description, classes } = this.props;
    const { sortBy, sortDirection } = this.state;
    const items = this.sortedTasks();

    return (
      <Dashboard
        title="View Tasks"
        helpView={<HelpView description={description} />}
        search={
          <Search
            placeholder="Search Task ID"
            onSubmit={this.handleTaskSearchSubmit}
          />
        }>
        <Typography variant="body2" className={classes.infoText}>
          Enter a task ID in the search box
        </Typography>
        {Boolean(items.length) && (
          <React.Fragment>
            <ListSubheader component="div" disableGutters>
              Recent Tasks
            </ListSubheader>
            <DataTable
              headers={[
                { id: 'taskId', label: 'Task ID' },
                { id: 'name', label: 'Name' },
                { id: 'state', label: 'State (at time of viewing)' },
                { id: 'taskQueueId', label: 'Queue' },
                { id: 'created', label: 'Created' },
                { id: 'viewedAt', label: 'Viewed' },
              ]}
              items={items}
              renderRow={this.renderTaskRow}
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
