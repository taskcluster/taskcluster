import React, { Component, Fragment } from 'react';
import { omit, pathOr, mergeRight } from 'ramda';
import cloneDeep from 'lodash.clonedeep';
import { withStyles } from '@material-ui/core/styles';
import Chip from '@material-ui/core/Chip';
import Grid from '@material-ui/core/Grid';
import Typography from '@material-ui/core/Typography';
import List from '@material-ui/core/List';
import ListItem from '@material-ui/core/ListItem';
import Checkbox from '@material-ui/core/Checkbox';
import jsonSchemaDefaults from 'json-schema-defaults';
import { dump } from 'js-yaml';
import { PurgeCache, Queue } from '@taskcluster/client-web';
import HammerIcon from 'mdi-react/HammerIcon';
import CreationIcon from 'mdi-react/CreationIcon';
import PencilIcon from 'mdi-react/PencilIcon';
import ClockOutlineIcon from 'mdi-react/ClockOutlineIcon';
import ShovelIcon from 'mdi-react/ShovelIcon';
import CloseIcon from 'mdi-react/CloseIcon';
import FlashIcon from 'mdi-react/FlashIcon';
import ConsoleLineIcon from 'mdi-react/ConsoleLineIcon';
import RestartIcon from 'mdi-react/RestartIcon';
import ChartIcon from 'mdi-react/ChartBarIcon';
import SortIcon from 'mdi-react/SortIcon';
import Spinner from '../../../components/Spinner';
import Dashboard from '../../../components/Dashboard';
import Markdown from '../../../components/Markdown';
import TaskDetailsCard from '../../../components/TaskDetailsCard';
import TaskRunsCard from '../../../components/TaskRunsCard';
import Helmet from '../../../components/Helmet';
import HelpView from '../../../components/HelpView';
import Search from '../../../components/Search';
import SpeedDial from '../../../components/SpeedDial';
import SpeedDialAction from '../../../components/SpeedDialAction';
import DialogAction from '../../../components/DialogAction';
import ChangeTaskPriorityDialog from '../../../components/ChangeTaskPriorityDialog';
import TaskActionForm from '../../../components/TaskActionForm';
import Breadcrumbs from '../../../components/Breadcrumbs';
import {
  ARTIFACTS_PAGE_SIZE,
  DEPENDENTS_PAGE_SIZE,
  VALID_TASK,
  TASK_ADDED_FIELDS,
  TASK_POLL_INTERVAL,
  UI_SCHEDULER_ID,
  TASK_STATE,
} from '../../../utils/constants';
import db from '../../../utils/db';
import ErrorPanel from '../../../components/ErrorPanel';
import formatError from '../../../utils/formatError';
import parameterizeTask from '../../../utils/parameterizeTask';
import { nice } from '../../../utils/slugid';
import Link from '../../../utils/Link';
import { changeTaskPriority } from '../../../utils/client';
import { getLatestArtifactUrl } from '../../../utils/getArtifactUrl';
import { AuthContext, withAuth } from '../../../utils/Auth';
import { withTaskclusterClient } from '../../../utils/TaskclusterClient';
import withResource from '../../../hocs/withResource';
import withPaginatedResource from '../../../hocs/withPaginatedResource';
import submitTaskAction from '../submitTaskAction';
import { subscribeToNamedEvents } from '../../../utils/pulseListener';

const updateTaskIdHistory = (id, task, status) => {
  if (!VALID_TASK.test(id)) {
    return;
  }

  db.taskIdsHistory.put({
    taskId: id,
    name: task?.metadata?.name,
    source: task?.metadata?.source,
    taskQueueId: task?.taskQueueId,
    created: task?.created,
    deadline: task?.deadline,
    state: status?.state,
    viewedAt: Date.now(),
  });
};

const taskInContext = (tagSetList, taskTags) =>
  tagSetList.some(tagSet =>
    Object.keys(tagSet).every(
      tag => taskTags[tag] && taskTags[tag] === tagSet[tag]
    )
  );
const getCachesFromTask = task =>
  Object.keys(pathOr({}, ['payload', 'cache'], task));
// actions.json actions that apply to a single task: task- and hook-kind actions
// with a non-empty context. Group-context actions belong to the task-group page.
const TASK_ACTION_KINDS = new Set(['task', 'hook']);
const filterTaskActions = actions =>
  actions.filter(
    ({ kind, context }) =>
      TASK_ACTION_KINDS.has(kind) &&
      Array.isArray(context) &&
      context.length > 0
  );
// The run shown in the runs card: the one in the URL, else the latest one.
// null while the status is unknown or the task has no runs yet.
const selectedRunId = ({ match, statusResource }) => {
  if (match.params.runId) {
    return parseInt(match.params.runId, 10);
  }

  const runs = statusResource.data?.runs;

  return runs?.length ? runs.length - 1 : null;
};

@withAuth
@withTaskclusterClient
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
@withResource({
  name: 'taskResource',
  fetch: props => () =>
    props
      .createTaskclusterClient({ Class: Queue })
      .task(props.match.params.taskId),
  key: props => props.match.params.taskId,
})
@withResource({
  name: 'statusResource',
  fetch: props => async () => {
    const { status } = await props
      .createTaskclusterClient({ Class: Queue })
      .status(props.match.params.taskId);

    return status;
  },
  key: props => props.match.params.taskId,
})
// The in-tree actions applicable to this task, from the decision task's
// public/actions.json, along with the decision task they run with the scopes
// of: `{ taskActions, decisionTask }`, or null when there are none.
@withResource({
  name: 'actionsResource',
  fetch: props => async () => {
    const { taskId } = props.match.params;
    const taskGroupId = props.taskResource.data?.taskGroupId;

    if (!taskGroupId) {
      return null;
    }

    // client-web refuses to follow the artifact endpoint's redirect, so
    // resolve the URL and fetch the (public) artifact directly.
    const response = await fetch(
      getLatestArtifactUrl({
        user: props.user,
        taskId: taskGroupId,
        name: 'public/actions.json',
      })
    );

    if (!response.ok) {
      return null;
    }

    const taskActions = await response.json().catch(() => null);

    if (!Array.isArray(taskActions?.actions)) {
      return null;
    }

    // a decision task is its own decision task; a task group does not
    // necessarily have one
    const decisionTask =
      taskId === taskGroupId
        ? null
        : await props
            .createTaskclusterClient({ Class: Queue })
            .task(taskGroupId)
            .catch(() => null);

    return {
      taskActions: {
        ...taskActions,
        actions: filterTaskActions(taskActions.actions),
      },
      decisionTask,
    };
  },
  key: props => props.taskResource.data?.taskGroupId ?? null,
})
@withPaginatedResource({
  name: 'dependentsResource',
  fetch:
    props =>
    ({ taskId, ...options }) =>
      props
        .createTaskclusterClient({ Class: Queue })
        .listDependentTasks(taskId, options),
  // taskId is included so the query re-runs when the route changes;
  // it is stripped back out in `fetch` before hitting the client.
  payload: props => ({
    taskId: props.match.params.taskId,
    limit: DEPENDENTS_PAGE_SIZE,
  }),
  select: response => response.tasks,
})
@withPaginatedResource({
  name: 'artifactsResource',
  fetch:
    props =>
    ({ taskId, runId, ...options }) =>
      runId === null
        ? Promise.resolve({ artifacts: [], continuationToken: null })
        : props
            .createTaskclusterClient({ Class: Queue })
            .listArtifacts(taskId, runId, options),
  payload: props => ({
    taskId: props.match.params.taskId,
    runId: selectedRunId(props),
    limit: ARTIFACTS_PAGE_SIZE,
  }),
  select: response => response.artifacts,
})
export default class ViewTask extends Component {
  static contextType = AuthContext;

  static getDerivedStateFromProps(props, state) {
    const taskId = props.match.params.taskId || '';
    const task = props.taskResource.data;
    const status = props.statusResource.data;

    if (taskId !== state.previousTaskId && task && status) {
      updateTaskIdHistory(taskId, task, status);

      const caches = getCachesFromTask(task);

      return {
        dialogOpen: false,
        previousTaskId: taskId,
        caches,
        selectedCaches: new Set(caches),
      };
    }

    return null;
  }

  getTaskActionsData() {
    const taskActions = [];
    const actionInputs = {};
    const actionData = {};
    const task = this.props.taskResource.data;
    const actions = this.props.actionsResource.data?.taskActions?.actions;

    if (Array.isArray(actions)) {
      actions.forEach(action => {
        // if an action with this name has already been selected,
        // don't consider this version
        if (
          task?.tags &&
          taskInContext(action.context, task.tags) &&
          !taskActions.some(({ name }) => name === action.name)
        ) {
          taskActions.push(action);
        } else {
          return;
        }

        const schema = action.schema || {};

        actionInputs[action.name] = dump(jsonSchemaDefaults(schema) || {});
        actionData[action.name] = { action };
      });
    }

    return { taskActions, actionInputs, actionData };
  }

  state = {
    previousTaskId: null,
    selectedAction: null,
    dialogOpen: false,
    actionLoading: false,
    dialogActionProps: null,
    dialogError: null,
    changePriorityDialogOpen: false,
    caches: null,
    selectedCaches: null,
    formInputs: null,
  };

  listener = null;

  pollTimer = null;

  componentDidMount() {
    // the Apollo query used to poll on TASK_POLL_INTERVAL
    this.pollTimer = setInterval(this.refetch, TASK_POLL_INTERVAL);
  }

  componentDidUpdate() {
    const { taskId } = this.props.match.params;
    const task = this.props.taskResource.data;

    if (task) {
      this.subscribe(taskId, this.refetch);
    }
  }

  componentWillUnmount() {
    this.unsubscribe();
    clearInterval(this.pollTimer);
  }

  queue() {
    return this.props.createTaskclusterClient({ Class: Queue });
  }

  // Reload what can change while a task is viewed: its status, the artifacts
  // of the shown run and its dependents. The definition only changes through
  // handleChangePriorityComplete, which reloads it explicitly.
  refetch = () => {
    this.props.statusResource.reload();
    this.props.artifactsResource.reload();
    this.props.dependentsResource.reload();
  };

  subscribe(taskId, refetch) {
    const { user, getCredentials } = this.context;

    if (this.listener) {
      if (this.listener.taskId === taskId && this.listener.user === user) {
        return this.listener;
      }

      // Replace the subscription on session changes so refreshed credentials
      // also recover a listener that stopped after authentication rejection.
      this.unsubscribe();
    }

    const unsubscribe = subscribeToNamedEvents(
      {
        service: 'queue',
        subscriptions: [
          'taskDefined',
          'taskPending',
          'taskRunning',
          'taskCompleted',
          'taskFailed',
          'taskException',
        ],
        routingKey: { taskId },
      },
      {
        // refetch everything as the pulse event holds incomplete task data
        onMessage: () => {
          refetch();
        },
        // the task query polls on TASK_POLL_INTERVAL, so a dropped socket
        // degrades to polling rather than losing updates
        onError: () => {},
        getCredentials,
      }
    );

    this.listener = { taskId, user, unsubscribe };
  }

  unsubscribe() {
    if (!this.listener) {
      return;
    }

    this.listener.unsubscribe();
    this.listener = null;
  }

  handleActionClick = name => () => {
    const { actionData, actionInputs } = this.getTaskActionsData();
    const { action } = actionData[name];

    this.setState({
      dialogError: null,
      dialogOpen: true,
      selectedAction: action,
      formInputs: actionInputs[name] ?? '',
    });
  };

  handleActionComplete = action => taskId => {
    this.handleActionDialogClose();
    this.handleActionTaskComplete(action, taskId);
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

  handleActionTaskSubmit =
    ({ name }) =>
    async () => {
      this.preRunningAction();

      const { user, match, taskResource, actionsResource } = this.props;
      const { taskActions, decisionTask } = actionsResource.data;
      const { formInputs } = this.state;
      const { actionData } = this.getTaskActionsData();
      const { action } = actionData[name];
      const taskId = await submitTaskAction({
        // the REST task definition carries no taskId, and actions run with
        // the scopes of the decision task
        task: {
          ...taskResource.data,
          taskId: match.params.taskId,
          decisionTask,
        },
        taskActions,
        form: formInputs,
        action,
        user,
      });

      return taskId;
    };

  // copy fields from the parent task, intentionally excluding some
  // fields which might cause confusion if left unchanged
  handleCloneTask = () => {
    const task = cloneDeep(this.props.taskResource.data);

    return mergeRight(
      omit(
        [
          ...TASK_ADDED_FIELDS,
          'routes',
          'taskGroupId',
          'schedulerId',
          'priority',
          'requires',
        ],
        task
      ),
      { schedulerId: UI_SCHEDULER_ID }
    );
  };

  handleRerunComplete = () => {
    this.handleActionDialogClose();
    this.refetch();
  };

  handleCancelComplete = () => {
    this.handleActionDialogClose();
    this.refetch();
  };

  handleCreateInteractiveComplete = taskId => {
    this.handleActionDialogClose();
    this.props.history.push(`/tasks/${taskId}/connect`);
  };

  handleRetriggerComplete = taskId => {
    this.handleActionDialogClose();
    this.props.history.push(`/tasks/${taskId}`);
  };

  handleCreateInteractiveTaskClick = () => {
    const title = 'Create with SSH/VNC';

    this.setState({
      dialogOpen: true,
      dialogActionProps: {
        fullScreen: false,
        body: (
          <Fragment>
            <Typography variant="body2">
              This will duplicate the task and create it under a different{' '}
              <code>taskId</code>.
            </Typography>
            <Typography variant="body2">
              The new task will be altered to:
            </Typography>
            <ul>
              <li>
                <Typography variant="body2">
                  Set <code>task.payload.features.interactive = true</code>
                </Typography>
              </li>
              <li>
                <Typography variant="body2">
                  Strip <code>task.payload.caches</code> to avoid poisoning
                </Typography>
              </li>
              <li>
                <Typography variant="body2">
                  Ensures <code>task.payload.maxRunTime</code> is minimum of 60
                  minutes
                </Typography>
              </li>
              <li>
                <Typography variant="body2">
                  Strip <code>task.routes</code> to avoid side-effects
                </Typography>
              </li>
              <li>
                <Typography variant="body2">
                  Set the environment variable{' '}
                  <code>TASKCLUSTER_INTERACTIVE=true</code>
                </Typography>
              </li>
            </ul>
            <Typography variant="body2">
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

  handleCreateLoaner = async () => {
    const taskId = nice();
    const task = parameterizeTask(cloneDeep(this.props.taskResource.data));

    this.preRunningAction();

    try {
      await this.queue().createTask(taskId, task);

      return taskId;
    } catch (error) {
      this.postRunningFailedAction(formatError(error));
      throw error;
    }
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
          <Typography variant="body2">
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

  handleFormChange = value =>
    this.setState({
      formInputs: value,
    });

  handleOpenLogProfiler = () => {
    const { taskId } = this.props.match.params;
    const profileUrl = `${window.env.TASKCLUSTER_ROOT_URL}/api/web-server/v1/task/${taskId}/profile`;
    const profilerUrl = `https://profiler.firefox.com/from-url/${encodeURIComponent(
      profileUrl
    )}`;

    window.open(profilerUrl, '_blank');
  };

  handleChangePriorityClick = () => {
    this.setState({ changePriorityDialogOpen: true });
  };

  handleChangePriorityClose = () => {
    this.setState({ changePriorityDialogOpen: false });
  };

  handleChangePriorityComplete = () => {
    this.setState({ changePriorityDialogOpen: false });
    // refresh the task so the new priority is reflected immediately
    this.props.taskResource.reload();
    this.refetch();
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

  handleCancelTaskClick = () => {
    const title = 'Cancel Task';

    this.setState({
      dialogOpen: true,
      dialogActionProps: {
        fullScreen: false,
        title: `${title}?`,
        onSubmit: this.cancelTask,
        onComplete: this.handleCancelComplete,
        confirmText: title,
      },
    });
  };

  handleRetriggerTaskClick = () => {
    const title = 'Retrigger';

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
            <Typography>
              The new task will be altered to:
              <ul>
                <li>
                  Update deadlines and other timestamps for the current time
                </li>
                <li>
                  Set number of <code>retries</code> to zero
                </li>
              </ul>
              <Typography>Note: this may not work with all tasks.</Typography>
            </Typography>
          </Fragment>
        ),
        title: `${title}?`,
        onSubmit: this.retriggerTask,
        onComplete: this.handleRetriggerComplete,
        confirmText: title,
      },
    });
  };

  handleRerunTaskClick = () => {
    const title = 'Rerun';

    this.setState({
      dialogOpen: true,
      dialogActionProps: {
        fullScreen: false,
        body: (
          <Typography variant="body2">
            This will cause a new run of the task to be created with the same{' '}
            <code>taskId</code>. It will only succeed if the task hasn&#39;t
            passed it&#39;s deadline. Notice that this may interfere with
            listeners who only expects this tasks to be resolved once.
          </Typography>
        ),
        title: `${title}?`,
        onSubmit: this.rerunTask,
        onComplete: this.handleRerunComplete,
        confirmText: title,
      },
    });
  };

  handleScheduleTaskClick = () => {
    const title = 'Schedule';

    this.setState({
      dialogOpen: true,
      dialogActionProps: {
        fullScreen: false,
        body: (
          <Typography variant="body2">
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

  handleTaskActionError = e => {
    this.setState({ dialogError: e, actionLoading: false });
  };

  handleTaskSearchSubmit = taskId => {
    if (this.props.match.params.taskId !== taskId) {
      this.props.history.push(`/tasks/${taskId}`);
    }
  };

  postRunningFailedAction = error => {
    this.setState({ dialogError: error, actionLoading: false });
  };

  preRunningAction = () => {
    this.setState({ dialogError: null, actionLoading: true });
  };

  purgeWorkerCache = async () => {
    // a task queue id is the worker pool id the purge-cache service expects
    const { taskQueueId } = this.props.taskResource.data;
    const { selectedCaches } = this.state;

    this.preRunningAction();

    try {
      const purgeCache = this.props.createTaskclusterClient({
        Class: PurgeCache,
      });

      await Promise.all(
        [...selectedCaches].map(cacheName =>
          purgeCache.purgeCache(taskQueueId, { cacheName })
        )
      );
    } catch (error) {
      this.postRunningFailedAction(error);
      throw error;
    }
  };

  rerunTask = async () => {
    const { taskId } = this.props.match.params;
    const { history, location } = this.props;

    this.preRunningAction();

    try {
      await this.queue().rerunTask(taskId);
      // make sure location doesn't include previous runId,
      // so the UI will show the latest run automatically
      history.push(`/tasks/${taskId}${location.hash}`);
    } catch (error) {
      this.postRunningFailedAction(error);
      throw error;
    }
  };

  cancelTask = async () => {
    const { taskId } = this.props.match.params;

    this.preRunningAction();

    try {
      await this.queue().cancelTask(taskId);
    } catch (error) {
      this.postRunningFailedAction(error);
      throw error;
    }
  };

  scheduleTask = async () => {
    const { taskId } = this.props.match.params;

    this.preRunningAction();

    try {
      await this.queue().scheduleTask(taskId);
    } catch (error) {
      this.postRunningFailedAction(error);
      throw error;
    }
  };

  retriggerTask = async () => {
    const taskId = nice();
    const task = cloneDeep(this.props.taskResource.data);
    const now = Date.now();
    const created = Date.parse(task.created);

    Object.assign(task, {
      retries: 0,
      deadline: new Date(now + Date.parse(task.deadline) - created).toJSON(),
      expires: new Date(now + Date.parse(task.expires) - created).toJSON(),
      created: new Date(now).toJSON(),
    });

    this.preRunningAction();

    try {
      await this.queue().createTask(taskId, task);

      return taskId;
    } catch (error) {
      this.postRunningFailedAction(error);
      throw error;
    }
  };

  renderActionIcon = action => {
    if (/^(rerun|retrigger)/.test(action.name)) {
      return <RestartIcon />;
    }

    switch (action.name) {
      case 'create-interactive': {
        return <ConsoleLineIcon />;
      }

      case 'cancel': {
        return <CloseIcon />;
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

  renderPurgeWorkerCacheDialogBody = selectedCaches => {
    const { caches } = this.state;

    return (
      <Fragment>
        <Typography variant="body2">
          This will purge caches used in this task across all workers of this
          worker type.
        </Typography>
        <Typography variant="body2">Select the caches to purge:</Typography>
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
              <Typography variant="body2">{cache}</Typography>
            </ListItem>
          ))}
        </List>
      </Fragment>
    );
  };

  render() {
    const {
      classes,
      description,
      match,
      user,
      taskResource,
      statusResource,
      dependentsResource,
      artifactsResource,
    } = this.props;
    const {
      dialogActionProps,
      selectedAction,
      dialogOpen,
      actionLoading,
      dialogError,
      formInputs,
    } = this.state;
    const { taskId } = match.params;
    const task = taskResource.data;
    const status = statusResource.data;
    const loading =
      (taskResource.loading && !task) || (statusResource.loading && !status);
    // a failed artifacts or dependents listing is a warning next to the task
    const error =
      taskResource.error ||
      statusResource.error ||
      artifactsResource.error ||
      dependentsResource.error;
    const loaded = Boolean(task && status);
    const { actionData, taskActions } = this.getTaskActionsData();
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
            defaultValue={taskId}
          />
        }>
        <Helmet state={status?.state} />
        {loading && (
          <Fragment>
            <Spinner loading />
            <br />
          </Fragment>
        )}
        <ErrorPanel fixed error={error} warning={loaded} />
        {loaded && (
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
                <TaskDetailsCard
                  taskId={taskId}
                  task={task}
                  status={status}
                  user={user}
                  dependents={dependentsResource.items}
                  dependentsLoading={dependentsResource.loading}
                  page={dependentsResource.page}
                  hasNextPage={dependentsResource.hasNextPage}
                  hasPreviousPage={dependentsResource.hasPreviousPage}
                  onNextPage={dependentsResource.nextPage}
                  onPreviousPage={dependentsResource.previousPage}
                  onChangePriority={this.handleChangePriorityClick}
                />
              </Grid>

              <Grid item xs={12} md={6}>
                <TaskRunsCard
                  taskId={taskId}
                  selectedRunId={selectedRunId(this.props) ?? 0}
                  runs={status.runs}
                  taskQueueId={task.taskQueueId}
                  artifacts={artifactsResource.items}
                  artifactsLoading={artifactsResource.loading}
                  page={artifactsResource.page}
                  hasNextPage={artifactsResource.hasNextPage}
                  hasPreviousPage={artifactsResource.hasPreviousPage}
                  onNextPage={artifactsResource.nextPage}
                  onPreviousPage={artifactsResource.previousPage}
                  // docker worker uses `task.payload.log` while
                  // generic worker uses `task.payload.logs.live`
                  liveLogName={task.payload?.logs?.live || task.payload?.log}
                />
              </Grid>
            </Grid>
            <SpeedDial>
              {!('cancel' in actionData) && (
                <SpeedDialAction
                  requiresAuth
                  tooltipOpen
                  FabProps={{
                    disabled: actionLoading,
                  }}
                  icon={<CloseIcon />}
                  tooltipTitle="Cancel"
                  onClick={this.handleCancelTaskClick}
                />
              )}
              {!('retrigger' in actionData) && (
                <SpeedDialAction
                  requiresAuth
                  tooltipOpen
                  FabProps={{
                    disabled: actionLoading,
                  }}
                  icon={<RestartIcon />}
                  tooltipTitle="Retrigger"
                  onClick={this.handleRetriggerTaskClick}
                />
              )}
              {!('rerun' in actionData) && (
                <SpeedDialAction
                  requiresAuth
                  tooltipOpen
                  FabProps={{
                    disabled: actionLoading,
                  }}
                  icon={<RestartIcon />}
                  tooltipTitle="Rerun"
                  onClick={this.handleRerunTaskClick}
                />
              )}
              {!('schedule' in actionData) && (
                <SpeedDialAction
                  requiresAuth
                  tooltipOpen
                  FabProps={{
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
                  FabProps={{
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
                FabProps={{
                  disabled: actionLoading,
                }}
                icon={<SortIcon />}
                tooltipTitle="Change Priority"
                onClick={this.handleChangePriorityClick}
              />
              <SpeedDialAction
                requiresAuth
                tooltipOpen
                FabProps={{
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
                  FabProps={{
                    disabled: actionLoading,
                  }}
                  icon={<ConsoleLineIcon />}
                  tooltipTitle="Create with SSH/VNC"
                  onClick={this.handleCreateInteractiveTaskClick}
                />
              )}
              <SpeedDialAction
                tooltipOpen
                icon={<ChartIcon />}
                FabProps={{
                  disabled: [
                    TASK_STATE.PENDING,
                    TASK_STATE.RUNNING,
                    TASK_STATE.UNSCHEDULED,
                  ].includes(status.state.toUpperCase()),
                }}
                tooltipTitle="Profile Task Log"
                onClick={this.handleOpenLogProfiler}
              />
              {taskActions?.length &&
                taskActions.map(action => (
                  <SpeedDialAction
                    requiresAuth
                    tooltipOpen
                    key={action.title}
                    FabProps={{
                      disabled: actionLoading,
                    }}
                    icon={this.renderActionIcon(action)}
                    tooltipTitle={action.title}
                    onClick={this.handleActionClick(action.name)}
                  />
                ))}
            </SpeedDial>
            {dialogOpen && (
              <DialogAction
                {...(dialogActionProps || {
                  fullScreen: Boolean(selectedAction.schema),
                  onSubmit: this.handleActionTaskSubmit(selectedAction),
                  onComplete: this.handleActionComplete(selectedAction),
                  title: `${selectedAction.title}?`,
                  body: (
                    <TaskActionForm
                      action={selectedAction}
                      form={formInputs}
                      onFormChange={this.handleFormChange}
                    />
                  ),
                  confirmText: selectedAction.title,
                })}
                open={dialogOpen}
                error={dialogError}
                onError={this.handleTaskActionError}
                onClose={this.handleActionDialogClose}
              />
            )}
            {this.state.changePriorityDialogOpen && (
              <ChangeTaskPriorityDialog
                open={this.state.changePriorityDialogOpen}
                currentPriority={task.priority}
                onSubmit={priority =>
                  changeTaskPriority({
                    taskId,
                    priority,
                    user,
                  })
                }
                onClose={this.handleChangePriorityClose}
                onComplete={this.handleChangePriorityComplete}
              />
            )}
          </Fragment>
        )}
      </Dashboard>
    );
  }
}
