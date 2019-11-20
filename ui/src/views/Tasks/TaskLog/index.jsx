import { hot } from 'react-hot-loader';
import React, { Component } from 'react';
import { graphql } from 'react-apollo';
import { withStyles } from '@material-ui/core/styles';
import ArrowLeftIcon from 'mdi-react/ArrowLeftIcon';
import Dashboard from '../../../components/Dashboard';
import Button from '../../../components/Button';
import Log from '../../../components/Log';
import Link from '../../../utils/Link';
import Helmet from '../../../components/Helmet';
import taskQuery from './task.graphql';
import Search from '../../../components/Search';

@hot(module)
@withStyles(theme => ({
  fab: {
    ...theme.mixins.fab,
    ...theme.mixins.actionButton,
    bottom: theme.spacing(3),
    right: theme.spacing(12),
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
      data: { task },
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
        <Log
          url={url}
          stream={stream}
          actions={
            <Link
              to={`/tasks/${match.params.taskId}/runs/${match.params.runId}`}>
              <Button
                spanProps={{ className: classes.fab }}
                tooltipProps={{ title: 'View Task' }}
                variant="round"
                color="secondary">
                <ArrowLeftIcon />
              </Button>
            </Link>
          }
        />
      </Dashboard>
    );
  }

  handleTaskSearchSubmit = taskId => {
    this.props.history.push(`/tasks/${taskId}`);
  };
}
