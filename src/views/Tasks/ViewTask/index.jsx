import { hot } from 'react-hot-loader';
import { Component, Fragment } from 'react';
import { graphql, withApollo } from 'react-apollo';
import { omit, pathOr } from 'ramda';
import cloneDeep from 'lodash.clonedeep';
import ErrorPanel from '@mozilla-frontend-infra/components/ErrorPanel';
import Spinner from '@mozilla-frontend-infra/components/Spinner';
import Markdown from '@mozilla-frontend-infra/components/Markdown';
import { withStyles } from '@material-ui/core/styles';
import Chip from '@material-ui/core/Chip';
import Divider from '@material-ui/core/Divider';
import Grid from '@material-ui/core/Grid';
import Typography from '@material-ui/core/Typography';
import List from '@material-ui/core/List';
import ListItem from '@material-ui/core/ListItem';
import Checkbox from '@material-ui/core/Checkbox';
import dotProp from 'dot-prop-immutable';
import jsonSchemaDefaults from 'json-schema-defaults';
import { safeDump } from 'js-yaml';
import HammerIcon from 'mdi-react/HammerIcon';
import CreationIcon from 'mdi-react/CreationIcon';
import PencilIcon from 'mdi-react/PencilIcon';
import ClockOutlineIcon from 'mdi-react/ClockOutlineIcon';
import ShovelIcon from 'mdi-react/ShovelIcon';
import CloseIcon from 'mdi-react/CloseIcon';
import FlashIcon from 'mdi-react/FlashIcon';
import ConsoleLineIcon from 'mdi-react/ConsoleLineIcon';
import RestartIcon from 'mdi-react/RestartIcon';
import Dashboard from '../../../components/Dashboard';
import TaskDetailsCard from '../../../components/TaskDetailsCard';
import TaskRunsCard from '../../../components/TaskRunsCard';
import Search from '../../../components/Search';
import SpeedDial from '../../../components/SpeedDial';
import SpeedDialAction from '../../../components/SpeedDialAction';
import DialogAction from '../../../components/DialogAction';
import TaskActionForm from '../../../components/TaskActionForm';
import {
  ACTIONS_JSON_KNOWN_KINDS,
  ARTIFACTS_PAGE_SIZE,
  VALID_TASK,
  TASK_ADDED_FIELDS,
} from '../../../utils/constants';
import db from '../../../utils/db';
import removeKeys from '../../../utils/removeKeys';
import { nice } from '../../../utils/slugid';
import parameterizeTask from '../../../utils/parameterizeTask';
import formatError from '../../../utils/formatError';
import submitTaskAction from '../submitTaskAction';
import taskQuery from './task.graphql';
import scheduleTaskQuery from './scheduleTask.graphql';
import purgeWorkerCacheQuery from './purgeWorkerCache.graphql';
import pageArtifactsQuery from './pageArtifacts.graphql';
import createTaskQuery from '../createTask.graphql';

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
    marginBottom: theme.spacing.unit,
  },
  divider: {
    margin: `${theme.spacing.triple}px 0`,
  },
  owner: {
    marginTop: theme.spacing.unit,
  },
  dialogListItem: {
    paddingTop: 0,
    paddingBottom: 0,
  },
}))
@graphql(taskQuery, {
  skip: props => !props.match.params.taskId,
  options: props => ({
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
  state = {
    taskSearch: '',
    // eslint-disable-next-line react/no-unused-state
    previousTaskId: null,
    taskActions: [],
    actionInputs: {},
    actionData: {},
    selectedAction: null,
    dialogOpen: false,
    actionLoading: false,
    dialogActionProps: null,
    dialogError: null,
    caches: null,
    selectedCaches: null,
  };

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

        actionInputs[action.name] = safeDump(jsonSchemaDefaults(schema) || {});
        actionData[action.name] = {
          action,
        };
      });
      const caches = getCachesFromTask(task);

      return {
        taskActions,
        actionInputs,
        actionData,
        taskSearch: taskId,
        previousTaskId: taskId,
        caches,
        selectedCaches: new Set(caches),
      };
    }

    return null;
  }

  handleActionClick = ({ target: { name } }) => {
    const { action } = this.state.actionData[name];

    this.setState({
      dialogError: null,
      dialogOpen: true,
      selectedAction: action,
    });
  };

  handleActionDialogClose = () => {
    this.setState({
      dialogOpen: false,
      selectedAction: null,
      dialogActionProps: null,
      dialogError: null,
      actionLoading: false,
    });
  };

  handleActionTaskComplete = (action, taskId) => {
    switch (action.name) {
      case 'create-interactive':
        this.props.history.push(`/tasks/${taskId}/connect`);
        break;
      default:
        this.props.history.push(`/tasks/${taskId}`);
    }
  };

  handleActionTaskSubmit = ({ name }) => async () => {
    this.preRunningAction();

    const {
      client,
      data: { task },
    } = this.props;
    const { actionInputs, actionData } = this.state;
    const form = actionInputs[name];
    const { action } = actionData[name];
    const taskId = await submitTaskAction({
      task,
      taskActions: task.taskActions,
      form,
      action,
      apolloClient: client,
    });

    return taskId;
  };

  handleTaskActionError = e => {
    this.setState({ dialogError: e, actionLoading: false });
  };

  handleTaskSearchChange = e => {
    this.setState({ taskSearch: e.target.value || '' });
  };

  handleTaskSearchSubmit = e => {
    e.preventDefault();

    const { taskSearch } = this.state;

    if (this.props.match.params.taskId !== taskSearch) {
      this.props.history.push(`/tasks/${this.state.taskSearch}`);
    }
  };

  handleFormChange = (value, name) =>
    this.setState({
      actionInputs: {
        ...this.state.actionInputs,
        [name]: value,
      },
    });

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

  scheduleTask = async () => {
    const { taskId } = this.props.match.params;

    this.preRunningAction();

    try {
      await this.props.client.mutate({
        mutation: scheduleTaskQuery,
        variables: {
          taskId,
        },
      });
    } catch (error) {
      this.postRunningFailedAction(error);
    }
  };

  preRunningAction = () => {
    this.setState({ dialogError: null, actionLoading: true });
  };

  postRunningFailedAction = error => {
    this.setState({ dialogError: error, actionLoading: false });
  };

  purgeWorkerCache = async () => {
    const { provisionerId, workerType } = this.props.data.task;
    const { selectedCaches } = this.state;

    this.preRunningAction();

    try {
      await Promise.all(
        [...selectedCaches].map(cacheName =>
          this.props.client.mutate({
            mutation: purgeWorkerCacheQuery,
            variables: {
              provisionerId,
              workerType,
              payload: {
                cacheName,
              },
            },
          })
        )
      );
    } catch (error) {
      this.postRunningFailedAction(error);
    }
  };

  handleScheduleTaskClick = () => {
    const title = 'Schedule';

    this.setState({
      dialogOpen: true,
      dialogActionProps: {
        fullScreen: false,
        body: (
          <Typography>
            This will <strong>overwrite any scheduling process</strong> taking
            place. If this task is part of a continuous integration process,
            scheduling this task may cause your commit to land with failing
            tests.
          </Typography>
        ),
        title: `${title}?`,
        onSubmit: this.scheduleTask,
        onComplete: this.handleActionDialogClose,
        confirmText: title,
      },
    });
  };

  renderPurgeWorkerCacheDialogBody = selectedCaches => {
    const { caches } = this.state;

    return (
      <Fragment>
        <Typography>
          This will purge caches used in this task across all workers of this
          worker type.
        </Typography>
        <Typography>Select the caches to purge:</Typography>
        <List>
          {caches.map(cache => (
            <ListItem
              className={this.props.classes.dialogListItem}
              onClick={this.handleSelectCacheClick(cache)}
              key={cache}>
              <Checkbox
                checked={selectedCaches.has(cache)}
                tabIndex={-1}
                disableRipple
              />
              <Typography>{cache}</Typography>
            </ListItem>
          ))}
        </List>
      </Fragment>
    );
  };

  handleSelectCacheClick = cache => () => {
    const selectedCaches = new Set([...this.state.selectedCaches]);

    if (selectedCaches.has(cache)) {
      selectedCaches.delete(cache);
    } else {
      selectedCaches.add(cache);
    }

    this.setState({
      selectedCaches,
      dialogActionProps: {
        ...this.state.dialogActionProps,
        body: this.renderPurgeWorkerCacheDialogBody(selectedCaches),
      },
    });
  };

  handlePurgeWorkerCacheClick = () => {
    const title = 'Purge Worker Cache';
    const { selectedCaches } = this.state;

    this.setState({
      dialogOpen: true,
      dialogActionProps: {
        fullScreen: false,
        body: this.renderPurgeWorkerCacheDialogBody(selectedCaches),
        title: `${title}?`,
        onSubmit: this.purgeWorkerCache,
        onComplete: this.handleActionDialogClose,
        confirmText: title,
      },
    });
  };

  handleCreateLoaner = async () => {
    const taskId = nice();
    const task = parameterizeTask(
      removeKeys(cloneDeep(this.props.data.task), ['__typename'])
    );

    this.preRunningAction();

    try {
      await this.props.client.mutate({
        mutation: createTaskQuery,
        variables: {
          taskId,
          task,
        },
      });

      return taskId;
    } catch (error) {
      this.postRunningFailedAction(formatError(error));
    }
  };

  // copy fields from the parent task, intentionally excluding some
  // fields which might cause confusion if left unchanged
  handleCloneTask = () => {
    const task = removeKeys(cloneDeep(this.props.data.task), ['__typename']);

    return omit(
      [
        ...TASK_ADDED_FIELDS,
        'routes',
        'taskGroupId',
        'schedulerId',
        'priority',
        'dependencies',
        'requires',
      ],
      task
    );
  };

  handleEdit = task =>
    this.props.history.push({
      pathname: '/tasks/create',
      state: { task },
    });

  handleEditTaskClick = () => {
    const title = 'Edit';

    this.setState({
      dialogOpen: true,
      dialogActionProps: {
        fullScreen: false,
        body: (
          <Typography>
            Note that the edited task will not be linked to other tasks nor have
            the same <code>task.routes</code> as other tasks, so this is not a
            way to fix a failing task in a larger task group. Note that you may
            also not have the scopes required to create the resulting task.
          </Typography>
        ),
        title: `${title}?`,
        onSubmit: this.handleCloneTask,
        onComplete: this.handleEditTaskComplete,
        confirmText: title,
      },
    });
  };

  handleEditTaskComplete = task => {
    this.handleActionDialogClose();
    this.handleEdit(task);
  };

  handleCreateInteractiveComplete = taskId => {
    this.handleActionDialogClose();
    this.props.history.push(`/tasks/${taskId}/connect`);
  };

  handleActionComplete = action => taskId => {
    this.handleActionDialogClose();
    this.handleActionTaskComplete(action, taskId);
  };

  handleCreateInteractiveTaskClick = () => {
    const title = 'Create Interactive';

    this.setState({
      dialogOpen: true,
      dialogActionProps: {
        fullScreen: false,
        body: (
          <Fragment>
            <Typography>
              This will duplicate the task and create it under a different{' '}
              <code>taskId</code>.
            </Typography>
            <Typography>The new task will be altered to:</Typography>
            <ul>
              <li>
                <Typography>
                  Set <code>task.payload.features.interactive = true</code>
                </Typography>
              </li>
              <li>
                <Typography>
                  Strip <code>task.payload.caches</code> to avoid poisoning
                </Typography>
              </li>
              <li>
                <Typography>
                  Ensures <code>task.payload.maxRunTime</code> is minimum of 60
                  minutes
                </Typography>
              </li>
              <li>
                <Typography>
                  Strip <code>task.routes</code> to avoid side-effects
                </Typography>
              </li>
              <li>
                <Typography>
                  Set the environment variable{' '}
                  <code>TASKCLUSTER_INTERACTIVE=true</code>
                </Typography>
              </li>
            </ul>
            <Typography>
              Note: this may not work with all tasks. You may not have the
              scopes required to create the task.
            </Typography>
          </Fragment>
        ),
        title: `${title}?`,
        onSubmit: this.handleCreateLoaner,
        onComplete: this.handleCreateInteractiveComplete,
        confirmText: title,
      },
    });
  };

  renderActionIcon = action => {
    switch (action.name) {
      case 'retrigger': {
        return <RestartIcon />;
      }

      case 'cancel': {
        return <CloseIcon />;
      }

      case 'rerun': {
        return <RestartIcon />;
      }

      case 'purge-caches': {
        return <CreationIcon />;
      }

      case 'backfill': {
        return <ShovelIcon />;
      }

      default: {
        return <HammerIcon />;
      }
    }
  };

  render() {
    const {
      classes,
      data: { loading, error, task, dependentTasks },
      match,
    } = this.props;
    const {
      dialogActionProps,
      actionData,
      taskActions,
      taskSearch,
      selectedAction,
      dialogOpen,
      actionInputs,
      actionLoading,
      dialogError,
    } = this.state;

    return (
      <Dashboard
        search={
          <Search
            value={taskSearch}
            onChange={this.handleTaskSearchChange}
            onSubmit={this.handleTaskSearchSubmit}
          />
        }>
        {loading && <Spinner loading />}
        {error &&
          error.graphQLErrors && (
            <ErrorPanel error={error} warning={Boolean(task)} />
          )}
        {task && (
          <Fragment>
            <Typography variant="headline" className={classes.title}>
              {task.metadata.name}
            </Typography>
            <Typography variant="subheading">
              <Markdown>{task.metadata.description}</Markdown>
            </Typography>
            <Chip
              className={classes.owner}
              label={
                <Fragment>
                  owned by:&nbsp;&nbsp;<em>{task.metadata.owner}</em>
                </Fragment>
              }
            />
            <Divider className={classes.divider} />
            <Grid container spacing={24}>
              <Grid item xs={12} md={6}>
                <TaskDetailsCard task={task} dependentTasks={dependentTasks} />
              </Grid>

              <Grid item xs={12} md={6}>
                <TaskRunsCard
                  selectedRunId={
                    match.params.runId
                      ? parseInt(match.params.runId, 10)
                      : task.status.runs.length - 1
                  }
                  runs={task.status.runs}
                  workerType={task.workerType}
                  provisionerId={task.provisionerId}
                  onArtifactsPageChange={this.handleArtifactsPageChange}
                />
              </Grid>
            </Grid>
            <SpeedDial>
              {!('schedule' in actionData) && (
                <SpeedDialAction
                  requiresAuth
                  tooltipOpen
                  ButtonProps={{
                    color: 'secondary',
                    disabled: actionLoading,
                  }}
                  icon={<ClockOutlineIcon />}
                  tooltipTitle="Schedule"
                  onClick={this.handleScheduleTaskClick}
                />
              )}
              {!('purge-caches' in actionData) && (
                <SpeedDialAction
                  requiresAuth
                  tooltipOpen
                  ButtonProps={{
                    color: 'secondary',
                    disabled: actionLoading,
                  }}
                  icon={<FlashIcon />}
                  tooltipTitle="Purge Worker Cache"
                  onClick={this.handlePurgeWorkerCacheClick}
                />
              )}
              <SpeedDialAction
                requiresAuth
                tooltipOpen
                ButtonProps={{
                  color: 'secondary',
                  disabled: actionLoading,
                }}
                icon={<PencilIcon />}
                tooltipTitle="Edit"
                onClick={this.handleEditTaskClick}
              />
              {!('create-interactive' in actionData) && (
                <SpeedDialAction
                  requiresAuth
                  tooltipOpen
                  ButtonProps={{
                    color: 'secondary',
                    disabled: actionLoading,
                  }}
                  icon={<ConsoleLineIcon />}
                  tooltipTitle="Create Interactive"
                  onClick={this.handleCreateInteractiveTaskClick}
                />
              )}
              {taskActions &&
                taskActions.length &&
                taskActions.map(action => (
                  <SpeedDialAction
                    requiresAuth
                    tooltipOpen
                    key={action.title}
                    ButtonProps={{
                      name: action.name,
                      color: 'primary',
                      disabled: actionLoading,
                    }}
                    icon={this.renderActionIcon(action)}
                    tooltipTitle={action.title}
                    onClick={this.handleActionClick}
                  />
                ))}
            </SpeedDial>
            {dialogOpen && (
              <DialogAction
                {...dialogActionProps || {
                  fullScreen: Boolean(selectedAction.schema),
                  onSubmit: this.handleActionTaskSubmit(selectedAction),
                  onComplete: this.handleActionComplete(selectedAction),
                  title: `${selectedAction.title}?`,
                  body: (
                    <TaskActionForm
                      action={selectedAction}
                      form={actionInputs[selectedAction.name]}
                      onFormChange={this.handleFormChange}
                    />
                  ),
                  confirmText: selectedAction.title,
                }}
                open={dialogOpen}
                error={dialogError}
                onError={this.handleTaskActionError}
                onClose={this.handleActionDialogClose}
              />
            )}
          </Fragment>
        )}
      </Dashboard>
    );
  }
}
