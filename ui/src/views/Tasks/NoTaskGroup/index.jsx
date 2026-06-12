import React, { Component } from 'react';
import { sum } from 'ramda';
import { withStyles } from '@material-ui/core/styles';
import Typography from '@material-ui/core/Typography';
import TableCell from '@material-ui/core/TableCell';
import TableRow from '@material-ui/core/TableRow';
import ListSubheader from '@material-ui/core/ListSubheader';
import Dashboard from '../../../components/Dashboard';
import HelpView from '../../../components/HelpView';
import Search from '../../../components/Search';
import DateDistance from '../../../components/DateDistance';
import StatusLabel from '../../../components/StatusLabel';
import DataTable from '../../../components/DataTable';
import CopyToClipboardTableCell from '../../../components/CopyToClipboardTableCell';
import Link from '../../../utils/Link';
import db from '../../../utils/db';

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
export default class NoTaskGroup extends Component {
  state = {
    recentTaskGroups: null,
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

  renderStatusCell(statusCount) {
    if (!statusCount) {
      return null;
    }

    const { completed, failed, exception, running, pending, unscheduled } =
      statusCount;
    const total = sum([
      completed,
      failed,
      exception,
      running,
      pending,
      unscheduled,
    ]);

    if (!total) {
      return null;
    }

    const unresolved = running + pending + unscheduled > 0;
    const parts = [];

    if (completed) {
      parts.push(`${completed} completed`);
    }
    if (failed) {
      parts.push(`${failed} failed`);
    }
    if (exception) {
      parts.push(`${exception} exception`);
    }
    if (running) {
      parts.push(`${running} running`);
    }
    if (pending) {
      parts.push(`${pending} pending`);
    }
    if (unscheduled) {
      parts.push(`${unscheduled} unscheduled`);
    }

    let resolvedState;

    if (unresolved) {
      resolvedState = 'RUNNING';
    } else if (failed > 0 || exception > 0) {
      resolvedState = 'FAILED';
    } else {
      resolvedState = 'COMPLETED';
    }

    // The full per-state breakdown moves into the tooltip (INV-8) so the
    // status cell stays compact; the resolved indicator stays visible.
    // The stored statusCount is a point-in-time snapshot, surfaced in the
    // same tooltip so it is never mistaken for live state (INV-5).
    return (
      <span>
        {total} tasks{' '}
        <StatusLabel
          state={resolvedState}
          title={`${parts.join(' · ')} (recorded at view time; may be stale)`}
        />
      </span>
    );
  }

  renderTaskGroupRow = entry => {
    const { classes } = this.props;
    const { taskGroupId, name, statusCount, taskQueueId, created, viewedAt } =
      entry;

    return (
      <TableRow key={taskGroupId}>
        <CopyToClipboardTableCell
          tooltipTitle={taskGroupId}
          textToCopy={taskGroupId}
          text={<code>{taskGroupId}</code>}
        />
        <TableCell>
          <Link to={`/tasks/groups/${taskGroupId}`}>{name || taskGroupId}</Link>
        </TableCell>
        <TableCell>{this.renderStatusCell(statusCount)}</TableCell>
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
    const { recentTaskGroups } = this.state;

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
        {recentTaskGroups && Boolean(recentTaskGroups.length) && (
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
              items={recentTaskGroups}
              renderRow={this.renderTaskGroupRow}
              paginate
              rowsPerPage={10}
            />
          </React.Fragment>
        )}
      </Dashboard>
    );
  }
}
