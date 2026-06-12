import React, { Component } from 'react';
import List from '@material-ui/core/List';
import ListItem from '@material-ui/core/ListItem';
import ListItemText from '@material-ui/core/ListItemText';
import ListSubheader from '@material-ui/core/ListSubheader';
import LinkIcon from 'mdi-react/LinkIcon';
import { withStyles } from '@material-ui/core/styles';
import Typography from '@material-ui/core/Typography';
import Dashboard from '../../../components/Dashboard';
import HelpView from '../../../components/HelpView';
import Search from '../../../components/Search';
import DateDistance from '../../../components/DateDistance';
import StatusLabel from '../../../components/StatusLabel';
import db from '../../../utils/db';
import Link from '../../../utils/Link';

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
  },
  source: {
    textOverflow: 'ellipsis',
    overflowX: 'hidden',
    whiteSpace: 'nowrap',
    maxWidth: 260,
    display: 'inline-block',
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

  renderSecondary(entry) {
    const { classes } = this.props;
    const { taskId, taskQueueId, created, source } = entry;
    const parts = [];

    if (taskQueueId) {
      parts.push(<span key="queue">{taskQueueId}</span>);
    }

    if (created) {
      parts.push(
        <span key="created">
          <DateDistance from={created} />
        </span>
      );
    }

    if (source) {
      parts.push(
        <span key="source" className={classes.source} title={source}>
          {source}
        </span>
      );
    }

    if (!parts.length) {
      return taskId;
    }

    return (
      <span className={classes.secondaryLine}>
        {parts.flatMap((el, i) => (i === 0 ? [el] : [' · ', el]))}
      </span>
    );
  }

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
          <List
            dense
            subheader={
              <ListSubheader component="div">Recent Tasks</ListSubheader>
            }>
            {recentTasks.map(entry => {
              const { taskId, name, state } = entry;

              return (
                <Link key={taskId} to={`/tasks/${taskId}`}>
                  <ListItem button className={classes.listItemButton}>
                    <ListItemText
                      primary={
                        <span>
                          {name || taskId}
                          {state && (
                            <>
                              {' '}
                              <StatusLabel state={state} />
                            </>
                          )}
                        </span>
                      }
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
