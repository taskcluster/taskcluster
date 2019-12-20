import { hot } from 'react-hot-loader';
import React, { Component, Fragment } from 'react';
import { withApollo, graphql } from 'react-apollo';
import Spinner from '@mozilla-frontend-infra/components/Spinner';
import { withStyles } from '@material-ui/core/styles';
import Chip from '@material-ui/core/Chip';
import Grid from '@material-ui/core/Grid';
import Typography from '@material-ui/core/Typography';
import dotProp from 'dot-prop-immutable';
import Dashboard from '../../../components/Dashboard';
import Markdown from '../../../components/Markdown';
import TaskDetailsCard from '../../../components/TaskDetailsCard';
import TaskRunsCard from '../../../components/TaskRunsCard';
import Helmet from '../../../components/Helmet';
import HelpView from '../../../components/HelpView';
import Search from '../../../components/Search';
import Breadcrumbs from '../../../components/Breadcrumbs';
import ErrorPanel from '../../../components/ErrorPanel';
import TaskActionButtons from '../TaskActionButtons';
import {
  ACTIONS_JSON_KNOWN_KINDS,
  ARTIFACTS_PAGE_SIZE,
  TASK_POLL_INTERVAL,
} from '../../../utils/constants';
import Link from '../../../utils/Link';
import taskQuery from './task.graphql';
import pageArtifactsQuery from './pageArtifacts.graphql';

@hot(module)
@withApollo
@withStyles(theme => ({
  title: {
    marginBottom: theme.spacing(1),
  },
  divider: {
    margin: `${theme.spacing(3)}px 0`,
  },
  tag: {
    margin: `${theme.spacing(1)}px ${theme.spacing(1)}px 0 0`,
  },
  link: {
    ...theme.mixins.link,
  },
}))
@graphql(taskQuery, {
  options: props => ({
    fetchPolicy: 'network-only',
    pollInterval: TASK_POLL_INTERVAL,
    errorPolicy: 'all',
    variables: {
      taskId: props.match.params.taskId,
      artifactsConnection: {
        limit: ARTIFACTS_PAGE_SIZE,
      },
      taskActionsFilter: {
        kind: {
          $in: ACTIONS_JSON_KNOWN_KINDS,
        },
        context: {
          $not: {
            $size: 0,
          },
        },
      },
    },
  }),
})
export default class ViewTask extends Component {
  handleArtifactsPageChange = ({ cursor, previousCursor }) => {
    const {
      match,
      data: { task, fetchMore },
    } = this.props;
    const runId = match.params.runId || 0;

    return fetchMore({
      query: pageArtifactsQuery,
      variables: {
        runId,
        taskId: task.taskId,
        connection: {
          limit: ARTIFACTS_PAGE_SIZE,
          cursor,
          previousCursor,
        },
      },
      updateQuery(previousResult, { fetchMoreResult }) {
        const { edges, pageInfo } = fetchMoreResult.artifacts;

        if (!edges.length) {
          return previousResult;
        }

        return dotProp.set(
          previousResult,
          `task.status.runs.${runId}.artifacts`,
          artifacts =>
            dotProp.set(
              dotProp.set(artifacts, 'edges', edges),
              'pageInfo',
              pageInfo
            )
        );
      },
    });
  };

  handleTaskSearchSubmit = taskId => {
    if (this.props.match.params.taskId !== taskId) {
      this.props.history.push(`/tasks/${taskId}`);
    }
  };

  render() {
    const {
      classes,
      description,
      data: { loading, error, task, refetch: refetchTask, dependentTasks },
      match,
    } = this.props;
    let tags;

    if (task) {
      tags = Object.entries(task.tags);
    }

    return (
      <Dashboard
        title={task ? `Task "${task.metadata.name}"` : 'Task'}
        helpView={<HelpView description={description} />}
        disableTitleFormatting
        search={
          <Search
            onSubmit={this.handleTaskSearchSubmit}
            defaultValue={match.params.taskId}
          />
        }>
        <Helmet state={task && task.status.state} />
        {loading && (
          <Fragment>
            <Spinner loading />
            <br />
          </Fragment>
        )}
        <ErrorPanel fixed error={error} warning={Boolean(task)} />
        {task && (
          <Fragment>
            <Breadcrumbs>
              <Link to={`/tasks/groups/${task.taskGroupId}`}>
                <Typography variant="body2" className={classes.link}>
                  Task Group
                </Typography>
              </Link>
              <Typography variant="body2" color="textSecondary">
                {task.metadata.name}
              </Typography>
            </Breadcrumbs>
            <br />
            <Typography variant="subtitle1">
              <Markdown>{task.metadata.description}</Markdown>
            </Typography>
            <div>
              <Chip
                className={classes.tag}
                label={
                  <Fragment>
                    owned by:&nbsp;&nbsp;
                    <em>{task.metadata.owner}</em>
                  </Fragment>
                }
              />

              {tags.map(([key, value]) => (
                <Chip
                  className={classes.tag}
                  key={key}
                  label={
                    <Fragment>
                      {key}
                      :&nbsp;&nbsp;
                      <em>{value}</em>
                    </Fragment>
                  }
                />
              ))}
            </div>
            <br />
            <br />
            <Grid container spacing={3}>
              <Grid item xs={12} md={6}>
                <TaskDetailsCard task={task} dependentTasks={dependentTasks} />
              </Grid>

              <Grid item xs={12} md={6}>
                <TaskRunsCard
                  selectedRunId={
                    match.params.runId
                      ? parseInt(match.params.runId, 10)
                      : Math.max(task.status.runs.length - 1, 0)
                  }
                  runs={task.status.runs}
                  workerType={task.workerType}
                  provisionerId={task.provisionerId}
                  onArtifactsPageChange={this.handleArtifactsPageChange}
                />
              </Grid>
            </Grid>
            <TaskActionButtons task={task} refetchTask={refetchTask} />
          </Fragment>
        )}
      </Dashboard>
    );
  }
}
