import React, { Component } from 'react';
import { sum } from 'ramda';
import { withStyles } from '@material-ui/core/styles';
import Typography from '@material-ui/core/Typography';
import List from '@material-ui/core/List';
import ListItem from '@material-ui/core/ListItem';
import ListItemText from '@material-ui/core/ListItemText';
import ListSubheader from '@material-ui/core/ListSubheader';
import LinkIcon from 'mdi-react/LinkIcon';
import Dashboard from '../../../components/Dashboard';
import HelpView from '../../../components/HelpView';
import Search from '../../../components/Search';
import DateDistance from '../../../components/DateDistance';
import StatusLabel from '../../../components/StatusLabel';
import Link from '../../../utils/Link';
import db from '../../../utils/db';

@withStyles(theme => ({
  infoText: {
    marginBottom: theme.spacing(1),
  },
  listItemButton: {
    ...theme.mixins.listItemButton,
    display: 'flex',
    justifyContent: 'space-between',
  },
  secondaryLine: {
    display: 'flex',
    alignItems: 'center',
    gap: theme.spacing(1),
    flexWrap: 'wrap',
  },
  source: {
    textOverflow: 'ellipsis',
    overflowX: 'hidden',
    whiteSpace: 'nowrap',
    maxWidth: 260,
    display: 'inline-block',
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

  renderStatusSummary(statusCount) {
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

    const resolved = running + pending + unscheduled === 0;
    const parts = [`${total} tasks`];

    if (completed) parts.push(`${completed} completed`);
    if (failed) parts.push(`${failed} failed`);
    if (exception) parts.push(`${exception} exception`);
    if (running) parts.push(`${running} running`);
    if (pending) parts.push(`${pending} pending`);

    return (
      <span>
        {parts.join(' · ')}
        {' · '}
        <StatusLabel state={resolved ? 'COMPLETED' : 'RUNNING'} />
      </span>
    );
  }

  renderSecondary(entry) {
    const { classes } = this.props;
    const { taskGroupId, taskQueueId, created, source, statusCount } = entry;
    const infoparts = [];

    if (taskQueueId) {
      infoparts.push(<span key="queue">{taskQueueId}</span>);
    }

    if (created) {
      infoparts.push(
        <span key="created">
          <DateDistance from={created} />
        </span>
      );
    }

    if (source) {
      infoparts.push(
        <span key="source" className={classes.source} title={source}>
          {source}
        </span>
      );
    }

    const statusSummary = this.renderStatusSummary(statusCount);
    const hasInfo = infoparts.length > 0 || statusSummary;

    if (!hasInfo) {
      return taskGroupId;
    }

    const infoLine =
      infoparts.length > 0
        ? infoparts.flatMap((el, i) => (i === 0 ? [el] : [' · ', el]))
        : null;

    return (
      <span className={classes.secondaryLine}>
        {infoLine}
        {infoLine && statusSummary && ' · '}
        {statusSummary}
      </span>
    );
  }

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
          <List
            dense
            subheader={
              <ListSubheader component="div">Recent Task Groups</ListSubheader>
            }>
            {recentTaskGroups.map(entry => {
              const { taskGroupId, name } = entry;

              return (
                <Link key={taskGroupId} to={`/tasks/groups/${taskGroupId}`}>
                  <ListItem button className={classes.listItemButton}>
                    <ListItemText
                      primary={name || taskGroupId}
                      secondary={this.renderSecondary(entry)}
                    />
                    <LinkIcon />
                  </ListItem>
                </Link>
              );
            })}
          </List>
        )}
      </Dashboard>
    );
  }
}
