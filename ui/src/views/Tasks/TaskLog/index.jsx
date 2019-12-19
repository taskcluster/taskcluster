import { hot } from 'react-hot-loader';
import React, { Component } from 'react';
import classNames from 'classnames';
import { withApollo, graphql } from 'react-apollo';
import { withStyles } from '@material-ui/core/styles';
import ArrowLeftIcon from 'mdi-react/ArrowLeftIcon';
import OpenInNewIcon from 'mdi-react/OpenInNewIcon';
import Dashboard from '../../../components/Dashboard';
import Button from '../../../components/Button';
import Log from '../../../components/Log';
import Search from '../../../components/Search';
import TaskActionButtons from '../../../components/TaskActionButtons';
import Helmet from '../../../components/Helmet';
import Link from '../../../utils/Link';
import taskQuery from './task.graphql';

@withApollo
@hot(module)
@withStyles(theme => ({
  fab: {
    ...theme.mixins.fab,
    ...theme.mixins.actionButton,
    bottom: theme.spacing(2),
  },
  rawLogFab: {
    right: theme.spacing(11),
    bottom: theme.spacing(3),
  },
  viewTaskFab: {
    right: theme.spacing(17),
    bottom: theme.spacing(3),
  },
}))
@graphql(taskQuery, {
  options: props => ({
    fetchPolicy: 'network-only',
    errorPolicy: 'all',
    variables: {
      taskId: props.match.params.taskId,
    },
  }),
})
export default class TaskLog extends Component {
  getCurrentRun() {
    return (
      this.props.data.task &&
      this.props.data.task.status.runs[this.props.match.params.runId]
    );
  }

  render() {
    const {
      classes,
      match,
      stream,
      data: { task, refetch: refetchTask },
    } = this.props;
    const url = decodeURIComponent(match.params.logUrl);
    const run = this.getCurrentRun();

    return (
      <Dashboard
        title={task ? `Log "${task.metadata.name}"` : 'Log'}
        disableTitleFormatting
        disablePadding
        search={
          <Search
            placeholder="Search Task ID"
            onSubmit={this.handleTaskSearchSubmit}
          />
        }>
        <Helmet state={run && run.state} />
        <Log url={url} stream={stream} />
        <Link to={`/tasks/${match.params.taskId}/runs/${match.params.runId}`}>
          <Button
            spanProps={{
              className: classNames(classes.fab, classes.viewTaskFab),
            }}
            tooltipProps={{ title: 'View Task' }}
            size="small"
            variant="round"
            color="secondary">
            <ArrowLeftIcon />
          </Button>
        </Link>
        <Button
          component="a"
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          spanProps={{ className: classNames(classes.fab, classes.rawLogFab) }}
          tooltipProps={{ title: 'Raw Log' }}
          size="small"
          variant="round"
          color="secondary">
          <OpenInNewIcon size={20} />
        </Button>
        <TaskActionButtons task={task} refetchTask={refetchTask} />
      </Dashboard>
    );
  }

  handleTaskSearchSubmit = taskId => {
    this.props.history.push(`/tasks/${taskId}`);
  };
}
