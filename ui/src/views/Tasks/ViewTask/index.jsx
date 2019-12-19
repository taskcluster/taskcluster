import { hot } from 'react-hot-loader';
import React, { Component, Fragment } from 'react';
import { withApollo, graphql } from 'react-apollo';
import { pathOr } from 'ramda';
import Spinner from '@mozilla-frontend-infra/components/Spinner';
import { withStyles } from '@material-ui/core/styles';
import Chip from '@material-ui/core/Chip';
import Grid from '@material-ui/core/Grid';
import Typography from '@material-ui/core/Typography';
import dotProp from 'dot-prop-immutable';
import jsonSchemaDefaults from 'json-schema-defaults';
import { safeDump } from 'js-yaml';
import Dashboard from '../../../components/Dashboard';
import Markdown from '../../../components/Markdown';
import TaskDetailsCard from '../../../components/TaskDetailsCard';
import TaskRunsCard from '../../../components/TaskRunsCard';
import Helmet from '../../../components/Helmet';
import HelpView from '../../../components/HelpView';
import Search from '../../../components/Search';
import Breadcrumbs from '../../../components/Breadcrumbs';
import ErrorPanel from '../../../components/ErrorPanel';
import TaskActionButtons from '../../../components/TaskActionButtons';
import {
  ACTIONS_JSON_KNOWN_KINDS,
  ARTIFACTS_PAGE_SIZE,
  VALID_TASK,
  TASK_POLL_INTERVAL,
} from '../../../utils/constants';
import db from '../../../utils/db';
import Link from '../../../utils/Link';
import taskQuery from './task.graphql';
import pageArtifactsQuery from './pageArtifacts.graphql';

const updateTaskIdHistory = id => {
  if (!VALID_TASK.test(id)) {
    return;
  }

  db.taskIdsHistory.put({ taskId: id });
};

const taskInContext = (tagSetList, taskTags) =>
  tagSetList.some(tagSet =>
    Object.keys(tagSet).every(
      tag => taskTags[tag] && taskTags[tag] === tagSet[tag]
    )
  );
const getCachesFromTask = task =>
  Object.keys(pathOr({}, ['payload', 'cache'], task));

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
  dialogListItem: {
    paddingTop: 0,
    paddingBottom: 0,
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
  static getDerivedStateFromProps(props, state) {
    const taskId = props.match.params.taskId || '';
    const {
      data: { task },
    } = props;
    const taskActions = [];
    const actionInputs = state.actionInputs || {};
    const actionData = state.actionData || {};

    if (taskId !== state.previousTaskId && task) {
      const { taskActions: actions } = task;

      updateTaskIdHistory(taskId);

      actions &&
        actions.actions.forEach(action => {
          const schema = action.schema || {};

          // if an action with this name has already been selected,
          // don't consider this version
          if (
            task &&
            task.tags &&
            taskInContext(action.context, task.tags) &&
            !taskActions.some(({ name }) => name === action.name)
          ) {
            taskActions.push(action);
          } else {
            return;
          }

          actionInputs[action.name] = safeDump(
            jsonSchemaDefaults(schema) || {}
          );
          actionData[action.name] = {
            action,
          };
        });
      const caches = getCachesFromTask(task);

      return {
        taskActions,
        actionInputs,
        actionData,
        previousTaskId: taskId,
        caches,
        selectedCaches: new Set(caches),
      };
    }

    return null;
  }

  state = {
    // eslint-disable-next-line react/no-unused-state
    previousTaskId: null,
    actionInputs: {},
    actionData: {},
  };

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
