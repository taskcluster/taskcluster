import React, { Component } from 'react';
import { withStyles } from '@material-ui/core/styles';
import TableCell from '@material-ui/core/TableCell';
import TableRow from '@material-ui/core/TableRow';
import Typography from '@material-ui/core/Typography';
import ListSubheader from '@material-ui/core/ListSubheader';
import Dashboard from '../../../components/Dashboard';
import HelpView from '../../../components/HelpView';
import Search from '../../../components/Search';
import DateDistance from '../../../components/DateDistance';
import StatusLabel from '../../../components/StatusLabel';
import DataTable from '../../../components/DataTable';
import CopyToClipboardTableCell from '../../../components/CopyToClipboardTableCell';
import db from '../../../utils/db';
import Link from '../../../utils/Link';

@withStyles(theme => ({
  infoText: {
    marginBottom: theme.spacing(1),
  },
  // Belt-and-suspenders on top of the DataTable's `overflowX: 'auto'`
  // wrapper: date/age fragments stay on one line (INV-2) and the table
  // scrolls as a unit rather than wrapping a cell's content.
  nowrap: {
    whiteSpace: 'nowrap',
  },
}))
export default class NoTask extends Component {
  state = {
    recentTasks: null,
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

  renderTaskRow = entry => {
    const { classes } = this.props;
    const { taskId, name, state, taskQueueId, created, viewedAt } = entry;

    return (
      <TableRow key={taskId}>
        <CopyToClipboardTableCell
          tooltipTitle={taskId}
          textToCopy={taskId}
          text={<code>{taskId}</code>}
        />
        <TableCell>
          <Link to={`/tasks/${taskId}`}>{name || taskId}</Link>
        </TableCell>
        <TableCell>
          {state ? (
            <StatusLabel
              state={state}
              title="State recorded at view time; may be stale"
            />
          ) : null}
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
    const { recentTasks } = this.state;

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
        {recentTasks && Boolean(recentTasks.length) && (
          <React.Fragment>
            <ListSubheader component="div" disableGutters>
              Recent Tasks
            </ListSubheader>
            <DataTable
              headers={[
                { id: 'taskId', label: 'Task ID' },
                { id: 'name', label: 'Name' },
                { id: 'state', label: 'State' },
                { id: 'taskQueueId', label: 'Queue' },
                { id: 'created', label: 'Created' },
                { id: 'viewedAt', label: 'Viewed' },
              ]}
              items={recentTasks}
              renderRow={this.renderTaskRow}
              paginate
              rowsPerPage={10}
            />
          </React.Fragment>
        )}
      </Dashboard>
    );
  }
}
