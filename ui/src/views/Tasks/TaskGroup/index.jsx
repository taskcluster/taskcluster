import React, { Component } from 'react';
import { withApollo } from '@apollo/client/react/hoc';
import { sum, isEmpty } from 'ramda';
import { paramCase } from 'param-case';
import jsonSchemaDefaults from 'json-schema-defaults';
import { dump } from 'js-yaml';
import { alpha, withStyles } from '@material-ui/core/styles';
import Badge from '@material-ui/core/Badge';
import FormControl from '@material-ui/core/FormControl';
import FormControlLabel from '@material-ui/core/FormControlLabel';
import Checkbox from '@material-ui/core/Checkbox';
import Grid from '@material-ui/core/Grid';
import FormGroup from '@material-ui/core/FormGroup';
import HammerIcon from 'mdi-react/HammerIcon';
import BellIcon from 'mdi-react/BellIcon';
import ChartIcon from 'mdi-react/ChartBarIcon';
import { Queue } from '@taskcluster/client-web';
import Spinner from '../../../components/Spinner';
import Button from '../../../components/Button';
import SpeedDial from '../../../components/SpeedDial';
import SpeedDialAction from '../../../components/SpeedDialAction';
import Dashboard from '../../../components/Dashboard';
import Search from '../../../components/Search';
import DialogAction from '../../../components/DialogAction';
import HelpView from '../../../components/HelpView';
import TaskGroupProgress from '../../../components/TaskGroupProgress';
import TaskGroupTable from '../../../components/TaskGroupTable';
import TaskActionForm from '../../../components/TaskActionForm';
import Snackbar from '../../../components/Snackbar';
import {
  TASK_GROUP_PAGE_SIZE,
  VALID_TASK,
  TASK_STATE,
  INITIAL_TASK_GROUP_NOTIFICATION_PREFERENCES,
  GROUP_NOTIFY_TASK_FAILED_KEY,
  GROUP_NOTIFY_SUCCESS_KEY,
} from '../../../utils/constants';
import db from '../../../utils/db';
import ErrorPanel from '../../../components/ErrorPanel';
import { getClient } from '../../../utils/client';
import { getLatestArtifactUrl } from '../../../utils/getArtifactUrl';
import { subscribeToNamedEvents } from '../../../utils/pulseListener';
import submitTaskAction from '../submitTaskAction';
import notify from '../../../utils/notify';
import logoFailed from '../../../images/logoFailed.png';
import logoCompleted from '../../../images/logoCompleted.png';
import TaskGroupStats from '../../../components/TaskGroupStats';
import CopyToClipboardListItem from '../../../components/CopyToClipboardListItem';
import DateDistance from '../../../components/DateDistance';
import { AuthContext } from '../../../utils/Auth';

// The first page is small so the table paints quickly; the rest of the group
// is fetched in TASK_GROUP_PAGE_SIZE chunks.
const FIRST_PAGE_SIZE = 20;
const initialTaskGroupActions = [
  {
    name: 'sealTaskGroup',
    title: 'Seal Task Group',
  },
  {
    name: 'cancelTaskGroup',
    title: 'Cancel Task Group',
  },
];
const initialActionData = {
  sealTaskGroup: {
    action: {
      name: 'sealTaskGroup',
      title: 'Seal Task Group',
      description: `### Seal Task Group
  This operation will seal Task Group.
  It would no longer be possible to add new tasks after.

  This operation is irreversible.
      `,
      schema: false,
    },
  },
  cancelTaskGroup: {
    action: {
      name: 'cancelTaskGroup',
      title: 'Cancel Task Group',
      description: `### Cancel Task Group
  This operation will cancel Task Group.
  All non-resolved tasks would be cancelled.

  Task Group has to be sealed before.
      `,
      schema: false,
    },
  },
};
const initialActionInputs = {
  sealTaskGroup: '',
  cancelTaskGroup: '',
};
const initialStatusCount = {
  completed: 0,
  failed: 0,
  exception: 0,
  running: 0,
  pending: 0,
  unscheduled: 0,
};
const updateTaskGroupIdHistory = (id, decisionTask, statusCount) => {
  if (!VALID_TASK.test(id)) {
    return;
  }

  db.taskGroupIdsHistory.put({
    taskGroupId: id,
    name: decisionTask?.metadata?.name,
    source: decisionTask?.metadata?.source,
    taskQueueId: decisionTask?.taskQueueId,
    created: decisionTask?.created,
    statusCount,
    viewedAt: Date.now(),
  });
};

// The queue's REST API reports task states in lowercase; the UI standardizes
// on the uppercase TASK_STATE values.
const toUiState = state => state?.toUpperCase();
// Map a REST task status to the node.status shape TaskGroupTable and
// TaskGroupStats consume.
const toNodeStatus = status => ({
  state: toUiState(status.state),
  runs: (status.runs ?? []).map(({ runId, started, resolved }) => ({
    runId,
    started,
    resolved,
  })),
});

@withApollo
@withStyles(theme => ({
  dashboard: {
    overflow: 'hidden',
  },
  firstGrid: {
    marginTop: theme.spacing(2),
  },
  secondGrid: {
    marginTop: theme.spacing(2),
    display: 'flex',
    justifyContent: 'flex-end',
  },
  taskNameFormSearch: {
    background: theme.palette.primary.main,
    '&:hover': {
      background: alpha(theme.palette.primary.main, 0.9),
    },
    '& input': {
      transition: 'unset !important',
      width: 'unset !important',
      color: alpha(theme.palette.text.primary, 0.5),
      '&:focus': {
        width: 'unset !important',
        color: alpha(theme.palette.text.primary, 0.9),
      },
    },
    '& svg': {
      fill: alpha(theme.palette.text.primary, 0.5),
    },
  },
  notifyButton: {
    marginLeft: theme.spacing(1),
  },
  statsButton: {
    marginLeft: theme.spacing(2),
  },
  bellIcon: {
    marginRight: theme.spacing(1),
  },
}))
export default class TaskGroup extends Component {
  static contextType = AuthContext;

  static calculateStatusCount(edges) {
    const statusCount = { ...initialStatusCount };

    (edges ?? []).forEach(({ node }) => {
      const { state } = node.status;

      switch (state) {
        case TASK_STATE.COMPLETED:
          statusCount.completed += 1;
          break;
        case TASK_STATE.FAILED:
          statusCount.failed += 1;
          break;
        case TASK_STATE.EXCEPTION:
          statusCount.exception += 1;
          break;
        case TASK_STATE.RUNNING:
          statusCount.running += 1;
          break;
        case TASK_STATE.PENDING:
          statusCount.pending += 1;
          break;
        case TASK_STATE.UNSCHEDULED:
          statusCount.unscheduled += 1;
          break;
        default:
          break;
      }
    });

    return statusCount;
  }

  constructor(props) {
    super(props);

    // Guards every async result (fetch pages, pulse messages, task lookups)
    // against a navigation to a different task group while it was in flight.
    this.currentTaskGroupId = null;
    this.listener = null;
    // taskIds present in this.edges
    this.tasks = new Set();
    this.edges = [];
    this.recordedStatusCount = null;

    // Batching for table updates
    this.tableUpdateTimer = null;
  }

  state = {
    filter: null,
    groupActions: initialTaskGroupActions,
    actionLoading: false,
    actionInputs: initialActionInputs,
    actionData: initialActionData,
    dialogOpen: false,
    selectedAction: null,
    dialogError: null,
    loading: true,
    error: null,
    taskGroupLoaded: false,
    // { edges } in the connection shape TaskGroupTable/TaskGroupStats consume
    taskGroupConnection: null,
    // group metadata from getTaskGroup; seal/cancel actions refresh it
    taskGroupInfo: null,
    // the decision task's definition (with taskId), when the group has one
    decisionTask: null,
    // parsed public/actions.json from the decision task, when present
    taskActions: null,
    searchTerm: null,
    notifyDialogOpen: false,
    notifyPreferences: INITIAL_TASK_GROUP_NOTIFICATION_PREFERENCES,
    previousNotifyPreferences: INITIAL_TASK_GROUP_NOTIFICATION_PREFERENCES,
    taskGroupWasRunningOnPageLoad: false,
    statsOpen: false,
    statusCount: initialStatusCount,

    snackbar: {
      message: '',
      variant: 'success',
      open: false,
    },
  };

  async componentDidMount() {
    const { taskGroupId } = this.props.match.params;
    const groupNotifyTaskFailed =
      'Notification' in window &&
      (await db.userPreferences.get(GROUP_NOTIFY_TASK_FAILED_KEY)) === true;
    const groupNotifySuccess =
      'Notification' in window &&
      (await db.userPreferences.get(GROUP_NOTIFY_SUCCESS_KEY)) === true;
    const searchTerm = this.props.location.hash.substr(1);

    this.setState({
      searchTerm,
      notifyPreferences: {
        groupNotifyTaskFailed,
        groupNotifySuccess,
      },
      previousNotifyPreferences: {
        groupNotifyTaskFailed,
        groupNotifySuccess,
      },
    });

    this.load(taskGroupId);
    this.subscribe(taskGroupId);
  }

  componentDidUpdate(prevProps) {
    const { taskGroupId } = this.props.match.params;

    if (prevProps.match.params.taskGroupId !== taskGroupId) {
      this.load(taskGroupId);
      this.subscribe(taskGroupId);
    }
  }

  componentWillUnmount() {
    this.currentTaskGroupId = null;
    this.unsubscribe();

    if (this.tableUpdateTimer) {
      clearTimeout(this.tableUpdateTimer);
    }
  }

  queue(options = {}) {
    return getClient({ Class: Queue, user: this.context.user, ...options });
  }

  // True when an async result for the given group should still be applied.
  isCurrent(taskGroupId) {
    return this.currentTaskGroupId === taskGroupId;
  }

  async load(taskGroupId) {
    this.currentTaskGroupId = taskGroupId;
    this.tasks.clear();
    this.edges = [];
    this.recordedStatusCount = null;

    if (this.tableUpdateTimer) {
      clearTimeout(this.tableUpdateTimer);
      this.tableUpdateTimer = null;
    }

    this.setState({
      loading: true,
      error: null,
      taskGroupLoaded: false,
      taskGroupConnection: null,
      taskGroupInfo: null,
      decisionTask: null,
      taskActions: null,
      groupActions: initialTaskGroupActions,
      actionInputs: initialActionInputs,
      actionData: initialActionData,
      taskGroupWasRunningOnPageLoad: false,
      statusCount: initialStatusCount,
    });

    const decisionTaskPromise = this.loadDecisionTask(taskGroupId);

    await Promise.all([
      this.loadTaskGroupInfo(taskGroupId),
      decisionTaskPromise.then(() => this.loadTaskActions(taskGroupId)),
      this.loadTasks(taskGroupId, decisionTaskPromise),
    ]);
  }

  async loadTaskGroupInfo(taskGroupId) {
    try {
      const taskGroupInfo = await this.queue().getTaskGroup(taskGroupId);

      if (this.isCurrent(taskGroupId)) {
        this.setState({ taskGroupInfo });
      }
    } catch (error) {
      // listTaskGroup fails the same way for a missing group; one report of
      // the failure is enough.
    }
  }

  async loadDecisionTask(taskGroupId) {
    try {
      const definition = await this.queue().task(taskGroupId);
      // The REST task definition carries no taskId; the decision task's is
      // its group's id.
      const decisionTask = { ...definition, taskId: taskGroupId };

      if (this.isCurrent(taskGroupId)) {
        this.setState({ decisionTask });
      }

      return decisionTask;
    } catch (error) {
      // task groups do not necessarily have a decision task
      return null;
    }
  }

  async loadTaskActions(taskGroupId) {
    try {
      // client-web refuses to follow the artifact endpoint's redirect, so
      // resolve the URL and fetch the (public) artifact directly.
      const url = getLatestArtifactUrl({
        user: this.context.user,
        taskId: taskGroupId,
        name: 'public/actions.json',
      });
      const response = await fetch(url);

      if (!response.ok || !this.isCurrent(taskGroupId)) {
        return;
      }

      const taskActions = await response.json();

      if (!this.isCurrent(taskGroupId) || !taskActions?.actions) {
        return;
      }

      const groupActions = [...initialTaskGroupActions];
      const actionInputs = { ...this.state.actionInputs };
      const actionData = { ...this.state.actionData };

      // group-context actions only; task-context actions belong to task pages
      taskActions.actions
        .filter(action => isEmpty(action.context))
        .forEach(action => {
          const schema = action.schema || {};

          // if an action with this name has already been selected,
          // don't consider this version
          if (!groupActions.some(({ name }) => name === action.name)) {
            groupActions.push(action);
            actionInputs[action.name] = dump(jsonSchemaDefaults(schema) || {});
            actionData[action.name] = {
              action,
            };
          }
        });

      this.setState({ taskActions, groupActions, actionInputs, actionData });
    } catch (error) {
      // a missing or malformed actions.json just means no in-tree actions
    }
  }

  async loadTasks(taskGroupId, decisionTaskPromise) {
    const queue = this.queue();
    let continuationToken = null;
    let firstPage = true;

    try {
      do {
        const options = firstPage
          ? { limit: FIRST_PAGE_SIZE }
          : { limit: TASK_GROUP_PAGE_SIZE, continuationToken };
        // eslint-disable-next-line no-await-in-loop
        const result = await queue.listTaskGroup(taskGroupId, options);

        if (!this.isCurrent(taskGroupId)) {
          return;
        }

        this.appendTasks(taskGroupId, result.tasks);

        if (firstPage) {
          firstPage = false;
          // Record the group in the recently-viewed history as soon as it
          // renders; the count is partial until the group is fully loaded, so
          // recordStatusCount re-records it then.
          // eslint-disable-next-line no-await-in-loop
          const decisionTask = await decisionTaskPromise;

          if (!this.isCurrent(taskGroupId)) {
            return;
          }

          updateTaskGroupIdHistory(
            taskGroupId,
            decisionTask,
            this.state.statusCount
          );
        }

        ({ continuationToken } = result);
      } while (continuationToken);

      this.setState({ taskGroupLoaded: true }, () => {
        this.recordStatusCount(taskGroupId);
      });
    } catch (error) {
      if (this.isCurrent(taskGroupId)) {
        this.setState({ error, loading: false });
      }
    }
  }

  appendTasks(taskGroupId, tasks) {
    const edges = tasks
      .filter(({ status }) => !this.tasks.has(status.taskId))
      .map(({ task, status }) => {
        this.tasks.add(status.taskId);

        return {
          node: {
            taskId: status.taskId,
            taskGroupId: status.taskGroupId,
            metadata: task.metadata,
            status: toNodeStatus(status),
          },
        };
      });

    this.edges = this.edges.concat(edges);

    const statusCount = TaskGroup.calculateStatusCount(this.edges);

    this.setState({
      loading: false,
      statusCount,
      taskGroupConnection: { edges: this.edges },
    });
    this.handleCountUpdate(statusCount);
  }

  unsubscribe = () => {
    if (!this.listener) {
      return;
    }

    this.listener.unsubscribe();
    this.listener = null;
  };

  subscribe = taskGroupId => {
    if (this.listener && this.listener.taskGroupId === taskGroupId) {
      return this.listener;
    }

    if (this.listener && this.listener.taskGroupId !== taskGroupId) {
      this.unsubscribe();
    }

    const unsubscribe = subscribeToNamedEvents(
      {
        subscriptions: [
          'taskDefined',
          'taskPending',
          'taskRunning',
          'taskCompleted',
          'taskFailed',
          'taskException',
        ],
        routingKey: { taskGroupId },
      },
      {
        onMessage: ({ payload }) => {
          this.handleTaskMessage(taskGroupId, payload);
        },
        // There is no polling fallback here: after a dropped socket the page
        // shows the last known state until it is reloaded.
        onError: () => {},
      }
    );

    this.listener = {
      taskGroupId,
      unsubscribe,
    };
  };

  handleTaskMessage(taskGroupId, payload) {
    const { status } = payload ?? {};

    // Make sure data is not from another task group which can happen when a
    // message is in flight and a user searches for a different task group.
    if (
      !status ||
      status.taskGroupId !== taskGroupId ||
      !this.isCurrent(taskGroupId)
    ) {
      return;
    }

    const state = toUiState(status.state);

    if (
      this.state.notifyPreferences.groupNotifyTaskFailed &&
      state === TASK_STATE.EXCEPTION
    ) {
      notify({
        body: 'A task exception occurred',
        icon: logoFailed,
      });
    } else if (
      this.state.notifyPreferences.groupNotifyTaskFailed &&
      state === TASK_STATE.FAILED
    ) {
      notify({
        body: 'A task failure occurred',
        icon: logoFailed,
      });
    }

    if (this.tasks.has(status.taskId)) {
      // already have this task, so just update its status
      this.edges = this.edges.map(edge => {
        if (edge.node.taskId !== status.taskId) {
          return edge;
        }

        return {
          ...edge,
          node: { ...edge.node, status: toNodeStatus(status) },
        };
      });
      this.afterEdgesChanged(taskGroupId);
    } else {
      // Unseen task. Pulse messages don't carry the task definition, so show
      // the taskId as the name until the definition is fetched.
      this.tasks.add(status.taskId);
      this.edges = this.edges.concat({
        node: {
          taskId: status.taskId,
          taskGroupId: status.taskGroupId,
          metadata: { name: status.taskId },
          status: toNodeStatus(status),
        },
      });
      this.afterEdgesChanged(taskGroupId);

      this.queue()
        .task(status.taskId)
        .then(definition => {
          if (!this.isCurrent(taskGroupId)) {
            return;
          }

          this.edges = this.edges.map(edge => {
            if (edge.node.taskId !== status.taskId) {
              return edge;
            }

            return {
              ...edge,
              node: { ...edge.node, metadata: definition.metadata },
            };
          });
          this.afterEdgesChanged(taskGroupId);
        })
        .catch(() => {});
    }
  }

  afterEdgesChanged(taskGroupId) {
    const statusCount = TaskGroup.calculateStatusCount(this.edges);

    if (
      JSON.stringify(statusCount) !== JSON.stringify(this.state.statusCount)
    ) {
      this.setState({ statusCount }, () => {
        this.recordStatusCount(taskGroupId);
      });
      this.handleCountUpdate(statusCount);
    }

    this.scheduleTableUpdate();
  }

  // Batch table refreshes: pulse messages can arrive in bursts, and the table
  // is expensive to re-render. The timer reads this.edges when it fires, so
  // the table always catches up to the latest state.
  scheduleTableUpdate = () => {
    if (this.tableUpdateTimer) {
      clearTimeout(this.tableUpdateTimer);
    }

    this.tableUpdateTimer = setTimeout(() => {
      this.tableUpdateTimer = null;
      this.setState({ taskGroupConnection: { edges: this.edges } });
    }, 300);
  };

  groupActionDisabled = name => {
    const { taskGroupInfo } = this.state;

    switch (name) {
      case 'sealTaskGroup':
        return !taskGroupInfo || !!taskGroupInfo.sealed;

      case 'cancelTaskGroup':
        return !taskGroupInfo?.sealed;

      default:
        return false;
    }
  };

  // The status count recorded while the group loads covers only the fetched
  // pages. Re-record once the group is fully loaded, and on later live
  // changes.
  recordStatusCount(taskGroupId) {
    const { taskGroupLoaded, statusCount, decisionTask } = this.state;

    if (!taskGroupLoaded || !statusCount) {
      return;
    }

    if (
      JSON.stringify(statusCount) === JSON.stringify(this.recordedStatusCount)
    ) {
      return;
    }

    this.recordedStatusCount = statusCount;
    updateTaskGroupIdHistory(taskGroupId, decisionTask, statusCount);
  }

  handleActionClick = name => () => {
    const { action } = this.state.actionData[name];

    this.setState({ dialogOpen: true, selectedAction: action });
  };

  handleActionComplete = taskId => {
    this.handleActionDialogClose();
    this.handleActionTaskComplete(taskId);
  };

  handleActionDialogClose = () => {
    this.setState({
      dialogOpen: false,
      selectedAction: null,
      dialogError: null,
      actionLoading: false,
    });
  };

  handleActionError = e => {
    this.setState({ dialogError: e, actionLoading: false });
  };

  handleActionSubmit =
    ({ name }) =>
    async () => {
      this.preRunningAction();

      const { taskGroupId } = this.props.match.params;

      if (name === 'sealTaskGroup') {
        const taskGroupInfo = await this.queue().sealTaskGroup(taskGroupId);

        this.setState({ taskGroupInfo });
        this.handleSnackbarOpen({
          message: 'Task Group sealed',
          open: true,
        });

        return null;
      }

      if (name === 'cancelTaskGroup') {
        const result = await this.queue().cancelTaskGroup(taskGroupId);

        this.handleSnackbarOpen({
          message: `Tasks cancelled: ${result.cancelledCount} out of ${result.taskGroupSize}.`,
          open: true,
        });

        return null;
      }

      const { actionInputs, actionData, decisionTask, taskActions } =
        this.state;
      const form = actionInputs[name];
      const { action } = actionData[name];
      const taskId = await submitTaskAction({
        task: decisionTask,
        taskActions,
        form,
        action,
        apolloClient: this.props.client,
        user: this.context.user,
      });

      return taskId;
    };

  handleActionTaskComplete = taskId => {
    if (taskId) {
      this.props.history.push(`/tasks/${taskId}`);
    }
  };

  handleFormChange = (value, name) =>
    this.setState({
      actionInputs: {
        ...this.state.actionInputs,
        [name]: value,
      },
    });

  handleStatusClick = async ({ currentTarget: { name } }) => {
    const filter = this.state.filter === name ? null : name;

    this.setState({ filter });
  };

  handleTaskGroupSearchSubmit = taskGroupId => {
    if (this.props.match.params.taskGroupId === taskGroupId) {
      return;
    }

    this.props.history.push(`/tasks/groups/${taskGroupId}`);
  };

  handleSnackbarOpen = ({ message, variant = 'success', open }) => {
    this.setState({ snackbar: { message, variant, open } });
  };

  handleOpenProfiler = () => {
    const { taskGroupId } = this.props.match.params;
    const profileUrl = `${window.env.TASKCLUSTER_ROOT_URL}/api/web-server/v1/task-group/${taskGroupId}/profile`;
    const profilerUrl = `https://profiler.firefox.com/from-url/${encodeURIComponent(
      profileUrl
    )}`;

    window.open(profilerUrl, '_blank');
  };

  handleSnackbarClose = (_event, reason) => {
    if (reason === 'clickaway') {
      return;
    }

    this.setState({
      snackbar: { message: '', variant: 'success', open: false },
    });
  };

  preRunningAction = () => {
    this.setState({ dialogError: null, actionLoading: true });
  };

  handleSearchTaskSubmit = searchTerm => {
    this.props.history.replace({ hash: searchTerm });
    this.setState({ searchTerm });
  };

  handleNotifyDialogSubmit = () => {
    Object.entries(this.state.notifyPreferences).map(([key, checked]) =>
      db.userPreferences.put(checked, paramCase(key))
    );

    this.setState({ previousNotifyPreferences: this.state.notifyPreferences });
  };

  handleNotifyDialogClose = () => {
    this.setState({
      notifyDialogOpen: false,
      notifyPreferences: this.state.previousNotifyPreferences,
    });
  };

  handleNotifyComplete = () => {
    this.handleNotifyDialogClose();
  };

  handleNotifyDialogOpen = () => {
    this.setState({ notifyDialogOpen: true });
  };

  handleStatsChart = () => {
    this.setState({ statsOpen: !this.state.statsOpen });
  };

  handleNotifyChange = async ({ target: { checked, value } }) => {
    // If we are turning off notifications, or if the
    // notification permission is already granted,
    // just change the notification state to the new value
    if (
      this.state.notifyPreferences[value] ||
      Notification.permission === 'granted'
    ) {
      return this.setState({
        notifyPreferences: {
          ...this.state.notifyPreferences,
          [value]: checked,
        },
      });
    }

    // Here we know the user is requesting to be notified,
    // but has not yet granted permission
    const permission = await Notification.requestPermission();

    this.setState({
      notifyPreferences: {
        ...this.state.notifyPreferences,
        [value]: permission === 'granted',
      },
    });
  };

  handleCountUpdate = statusCount => {
    const {
      taskGroupLoaded,
      notifyPreferences,
      taskGroupWasRunningOnPageLoad,
    } = this.state;
    const { completed, exception, failed, pending, running, unscheduled } =
      statusCount;
    const allTasksCount = sum([
      completed,
      exception,
      pending,
      failed,
      running,
      unscheduled,
    ]);
    const isTaskGroupSuccess =
      taskGroupLoaded && allTasksCount - completed === 0 && completed > 0;

    // Allow notifying the success if and only if
    // the task group was running on page load
    if (allTasksCount - completed > 0) {
      this.setState({ taskGroupWasRunningOnPageLoad: true });
    }

    if (
      notifyPreferences.groupNotifySuccess &&
      isTaskGroupSuccess &&
      taskGroupWasRunningOnPageLoad
    ) {
      notify({
        body: 'Task group success',
        icon: logoCompleted,
      });
    }
  };

  render() {
    const {
      groupActions,
      filter,
      actionLoading,
      dialogOpen,
      selectedAction,
      actionInputs,
      dialogError,
      loading,
      error,
      taskGroupLoaded,
      taskGroupConnection,
      taskGroupInfo,
      decisionTask,
      searchTerm,
      notifyDialogOpen,
      notifyPreferences,
      statsOpen,
      snackbar,
    } = this.state;
    const bellIconSize = 16;
    const {
      description,
      match: {
        params: { taskGroupId },
      },
      classes,
    } = this.props;
    const notificationsCount =
      Object.values(notifyPreferences).filter(Boolean).length;
    const title = ['Task Group'];

    if (decisionTask?.metadata?.name) {
      title.push(decisionTask.metadata.name);
    }

    return (
      <Dashboard
        title={title.join(' - ')}
        className={classes.dashboard}
        helpView={<HelpView description={description} />}
        search={
          <Search
            onSubmit={this.handleTaskGroupSearchSubmit}
            defaultValue={taskGroupId}
          />
        }>
        <ErrorPanel
          fixed
          error={error}
          warning={Boolean(taskGroupConnection)}
        />
        {taskGroupConnection && taskGroupInfo && (
          <React.Fragment>
            <TaskGroupProgress
              taskGroupId={taskGroupId}
              taskGroupLoaded={taskGroupLoaded}
              statusCount={this.state.statusCount}
              filter={filter}
              onStatusClick={this.handleStatusClick}
            />
            <Grid container className={classes.firstGrid}>
              <Grid item xs={6}>
                <CopyToClipboardListItem
                  tooltipTitle={taskGroupInfo.expires}
                  textToCopy={taskGroupInfo.expires}
                  primary="Task Group Expires"
                  secondary={<DateDistance from={taskGroupInfo.expires} />}
                />
              </Grid>
              <Grid item xs={6}>
                {taskGroupInfo.sealed && (
                  <CopyToClipboardListItem
                    tooltipTitle={taskGroupInfo.sealed}
                    textToCopy={taskGroupInfo.sealed}
                    primary="Task Group Sealed"
                    secondary={<DateDistance from={taskGroupInfo.sealed} />}
                  />
                )}
              </Grid>
            </Grid>
          </React.Fragment>
        )}
        {!loading && taskGroupConnection && (
          <Grid container>
            <Grid item xs={12} sm={8} className={classes.firstGrid}>
              <Search
                formProps={{ className: classes.taskNameFormSearch }}
                placeholder="Name contains"
                defaultValue={searchTerm}
                onSubmit={this.handleSearchTaskSubmit}
              />
            </Grid>
            <Grid item xs={9} sm={4} className={classes.secondGrid}>
              <Button
                size="small"
                onClick={this.handleStatsChart}
                className={classes.statsButton}
                variant="outlined">
                <ChartIcon size={bellIconSize} className={classes.bellIcon} />
                Stats
              </Button>
              {'Notification' in window && (
                <Badge
                  className={classes.notifyButton}
                  color="secondary"
                  badgeContent={notificationsCount}>
                  <Button
                    size="small"
                    onClick={this.handleNotifyDialogOpen}
                    variant="outlined">
                    <BellIcon
                      size={bellIconSize}
                      className={classes.bellIcon}
                    />
                    Notifications
                  </Button>
                </Badge>
              )}
            </Grid>
          </Grid>
        )}
        <br />
        {statsOpen && (
          <TaskGroupStats
            searchTerm={searchTerm}
            filter={filter}
            taskGroup={taskGroupConnection}
          />
        )}
        {!error && loading && <Spinner loading />}
        {!loading && taskGroupConnection && (
          <TaskGroupTable
            searchTerm={searchTerm}
            filter={filter}
            taskGroupConnection={taskGroupConnection}
            showTimings={statsOpen}
          />
        )}
        {!loading && (
          <SpeedDial>
            <SpeedDialAction
              tooltipOpen
              icon={<ChartIcon />}
              tooltipTitle="Open in Profiler"
              onClick={this.handleOpenProfiler}
            />
            {groupActions?.map(action => (
              <SpeedDialAction
                requiresAuth
                tooltipOpen
                key={action.title}
                FabProps={{
                  disabled:
                    actionLoading || this.groupActionDisabled(action.name),
                }}
                icon={<HammerIcon />}
                tooltipTitle={action.title}
                onClick={this.handleActionClick(action.name)}
              />
            ))}
          </SpeedDial>
        )}
        {dialogOpen && (
          <DialogAction
            fullScreen={Boolean(selectedAction.schema)}
            open={dialogOpen}
            error={dialogError}
            onSubmit={this.handleActionSubmit(selectedAction)}
            onComplete={this.handleActionComplete}
            onError={this.handleActionError}
            onClose={this.handleActionDialogClose}
            title={selectedAction.title}
            body={
              <TaskActionForm
                action={selectedAction}
                form={actionInputs[selectedAction.name]}
                onFormChange={this.handleFormChange}
              />
            }
            confirmText={selectedAction.title}
          />
        )}
        <DialogAction
          open={notifyDialogOpen}
          confirmText="Save"
          title="Task Group Notifications"
          onSubmit={this.handleNotifyDialogSubmit}
          onComplete={this.handleNotifyComplete}
          onClose={this.handleNotifyDialogClose}
          body={
            <FormControl component="fieldset" className={classes.formControl}>
              <FormGroup>
                <FormControlLabel
                  control={
                    <Checkbox
                      checked={notifyPreferences.groupNotifyTaskFailed}
                      onChange={this.handleNotifyChange}
                      value="groupNotifyTaskFailed"
                    />
                  }
                  label="Notify on task failures"
                />
                <FormControlLabel
                  control={
                    <Checkbox
                      checked={notifyPreferences.groupNotifySuccess}
                      onChange={this.handleNotifyChange}
                      value="groupNotifySuccess"
                    />
                  }
                  label="Notify on task group success"
                />
              </FormGroup>
            </FormControl>
          }
        />
        <Snackbar onClose={this.handleSnackbarClose} {...snackbar} />
      </Dashboard>
    );
  }
}
