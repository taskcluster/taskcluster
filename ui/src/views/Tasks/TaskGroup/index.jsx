import { hot } from 'react-hot-loader';
import cloneDeep from 'lodash.clonedeep';
import React, { Component } from 'react';
import { graphql, withApollo } from 'react-apollo';
import dotProp from 'dot-prop-immutable';
import { sum, isEmpty } from 'ramda';
import { kebabCase } from 'change-case';
import jsonSchemaDefaults from 'json-schema-defaults';
import { safeDump } from 'js-yaml';
import { withStyles } from '@material-ui/core/styles';
import Spinner from '@mozilla-frontend-infra/components/Spinner';
import Badge from '@material-ui/core/Badge';
import FormControl from '@material-ui/core/FormControl';
import FormControlLabel from '@material-ui/core/FormControlLabel';
import Checkbox from '@material-ui/core/Checkbox';
import Grid from '@material-ui/core/Grid';
import FormGroup from '@material-ui/core/FormGroup';
import HammerIcon from 'mdi-react/HammerIcon';
import BellIcon from 'mdi-react/BellIcon';
import { fade } from '@material-ui/core/styles/colorManipulator';
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
import {
  TASK_GROUP_PAGE_SIZE,
  VALID_TASK,
  ACTIONS_JSON_KNOWN_KINDS,
  INITIAL_CURSOR,
  TASK_STATE,
  INITIAL_TASK_GROUP_NOTIFICATION_PREFERENCES,
  GROUP_NOTIFY_TASK_FAILED_KEY,
  GROUP_NOTIFY_SUCCESS_KEY,
} from '../../../utils/constants';
import db from '../../../utils/db';
import ErrorPanel from '../../../components/ErrorPanel';
import taskGroupQuery from './taskGroup.graphql';
import taskGroupSubscription from './taskGroupSubscription.graphql';
import submitTaskAction from '../submitTaskAction';
import notify from '../../../utils/notify';
import logoFailed from '../../../images/logoFailed.png';
import logoCompleted from '../../../images/logoCompleted.png';

const updateTaskGroupIdHistory = id => {
  if (!VALID_TASK.test(id)) {
    return;
  }

  db.taskGroupIdsHistory.put({ taskGroupId: id });
};

@hot(module)
@withApollo
@graphql(taskGroupQuery, {
  options: props => ({
    fetchPolicy: 'network-only',
    errorPolicy: 'all',
    variables: {
      taskGroupId: props.match.params.taskGroupId,
      taskGroupConnection: {
        limit: 20,
      },
      taskActionsFilter: {
        kind: {
          $in: ACTIONS_JSON_KNOWN_KINDS,
        },
        context: {
          $or: [{ $size: 0 }, { $size: 1 }],
        },
      },
    },
  }),
})
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
      background: fade(theme.palette.primary.main, 0.9),
    },
    '& input': {
      transition: 'unset !important',
      width: 'unset !important',
      color: fade(theme.palette.text.primary, 0.5),
      '&:focus': {
        width: 'unset !important',
        color: fade(theme.palette.text.primary, 0.9),
      },
    },
    '& svg': {
      fill: fade(theme.palette.text.primary, 0.5),
    },
  },
  notifyButton: {
    marginLeft: theme.spacing(3),
  },
  bellIcon: {
    marginRight: theme.spacing(1),
  },
}))
export default class TaskGroup extends Component {
  static getDerivedStateFromProps(props, state) {
    const { taskGroupId } = props.match.params;
    const { taskActions, taskGroup } = props.data;
    const groupActions = [];
    const actionInputs = state.actionInputs || {};
    const actionData = state.actionData || {};
    const taskGroupLoaded = taskGroup && !taskGroup.pageInfo.hasNextPage;
    // Make sure data is not from another task group which
    // can happen when a user searches for a different task group
    const isFromSameTaskGroupId =
      taskGroup && taskGroup.edges[0]
        ? taskGroup.edges[0].node.taskGroupId === taskGroupId
        : true;

    if (
      isFromSameTaskGroupId &&
      taskGroupId !== state.previousTaskGroupId &&
      taskActions
    ) {
      updateTaskGroupIdHistory(taskGroupId);
      taskActions.actions
        .filter(action => isEmpty(action.context))
        .forEach(action => {
          const schema = action.schema || {};

          // if an action with this name has already been selected,
          // don't consider this version
          if (!groupActions.some(({ name }) => name === action.name)) {
            groupActions.push(action);
            actionInputs[action.name] = safeDump(
              jsonSchemaDefaults(schema) || {}
            );
            actionData[action.name] = {
              action,
            };
          }
        });

      return {
        groupActions,
        actionInputs,
        actionData,
        previousTaskGroupId: taskGroupId,
        taskGroupLoaded,
      };
    }

    return {
      taskGroupLoaded: isFromSameTaskGroupId ? taskGroupLoaded : false,
      taskGroupWasRunningOnPageLoad: isFromSameTaskGroupId
        ? state.taskGroupWasRunningOnPageLoad
        : false,
    };
  }

  constructor(props) {
    super(props);

    this.previousCursor = INITIAL_CURSOR;
    this.listener = null;
    this.tasks = new Map();
  }

  state = {
    filter: null,
    // eslint-disable-next-line react/no-unused-state
    previousTaskGroupId: '',
    groupActions: [],
    actionLoading: false,
    actionInputs: {},
    actionData: {},
    dialogOpen: false,
    selectedAction: null,
    dialogError: null,
    taskGroupLoaded: false,
    searchTerm: null,
    notifyDialogOpen: false,
    notifyPreferences: INITIAL_TASK_GROUP_NOTIFICATION_PREFERENCES,
    previousNotifyPreferences: INITIAL_TASK_GROUP_NOTIFICATION_PREFERENCES,
    taskGroupWasRunningOnPageLoad: false,
  };

  async componentDidMount() {
    const groupNotifyTaskFailed =
      'Notification' in window &&
      (await db.userPreferences.get(GROUP_NOTIFY_TASK_FAILED_KEY)) === true;
    const groupNotifySuccess =
      'Notification' in window &&
      (await db.userPreferences.get(GROUP_NOTIFY_SUCCESS_KEY)) === true;

    this.setState({
      notifyPreferences: {
        groupNotifyTaskFailed,
        groupNotifySuccess,
      },
      previousNotifyPreferences: {
        groupNotifyTaskFailed,
        groupNotifySuccess,
      },
    });
  }

  unsubscribe = () => {
    if (!this.listener) {
      return;
    }

    this.listener.unsubscribe();
    this.listener = null;
  };

  subscribe = ({ taskGroupId, subscribeToMore }) => {
    if (this.listener && this.listener.taskGroupId === taskGroupId) {
      return this.listener;
    }

    if (this.listener && this.listener.taskGroupId !== taskGroupId) {
      this.unsubscribe();
    }

    const unsubscribe = subscribeToMore({
      document: taskGroupSubscription,
      variables: {
        taskGroupId,
        subscriptions: [
          'tasksDefined',
          'tasksPending',
          'tasksRunning',
          'tasksCompleted',
          'tasksFailed',
          'tasksException',
        ],
      },
      updateQuery: (previousResult, { subscriptionData }) => {
        const { tasksSubscriptions } = subscriptionData.data;
        // Make sure data is not from another task group which
        // can happen when a message is in flight and a user searches for
        // a different task group.
        const isFromSameTaskGroupId =
          tasksSubscriptions.taskGroupId === taskGroupId;

        if (
          !previousResult ||
          !previousResult.taskGroup ||
          !isFromSameTaskGroupId
        ) {
          return previousResult;
        }

        let edges;

        if (
          this.state.notifyPreferences.groupNotifyTaskFailed &&
          tasksSubscriptions.state === TASK_STATE.EXCEPTION
        ) {
          notify({
            body: 'A task exception occurred',
            icon: logoFailed,
          });
        } else if (
          this.state.notifyPreferences.groupNotifyTaskFailed &&
          tasksSubscriptions.state === TASK_STATE.FAILED
        ) {
          notify({
            body: 'A task failure occurred',
            icon: logoFailed,
          });
        }

        if (this.tasks.has(tasksSubscriptions.taskId)) {
          // already have this task, so just update the state
          edges = previousResult.taskGroup.edges.map(edge => {
            if (tasksSubscriptions.taskId !== edge.node.taskId) {
              return edge;
            }

            return dotProp.set(edge, 'node', node =>
              dotProp.set(node, 'status', status =>
                dotProp.set(status, 'state', tasksSubscriptions.state)
              )
            );
          });
        } else {
          // unseen task, so keep the Task and TaskStatus values
          this.tasks.set(tasksSubscriptions.taskId);
          edges = previousResult.taskGroup.edges.concat({
            // eslint-disable-next-line no-underscore-dangle
            __typename: 'TasksEdge',
            node: {
              ...cloneDeep(tasksSubscriptions.task),
              status: {
                state: tasksSubscriptions.state,
                __typename: 'TaskStatus',
              },
            },
          });
        }

        return dotProp.set(previousResult, 'taskGroup', taskGroup =>
          dotProp.set(taskGroup, 'edges', edges)
        );
      },
    });

    this.listener = {
      taskGroupId,
      unsubscribe,
    };
  };

  componentDidUpdate(prevProps) {
    const {
      data: { taskGroup, subscribeToMore },
      match: {
        params: { taskGroupId },
      },
    } = this.props;

    if (prevProps.match.params.taskGroupId !== taskGroupId) {
      this.tasks.clear();
      this.previousCursor = INITIAL_CURSOR;
      updateTaskGroupIdHistory(taskGroupId);
      this.subscribe({ taskGroupId, subscribeToMore });
    }

    if (
      taskGroup &&
      this.previousCursor === taskGroup.pageInfo.cursor &&
      taskGroup.pageInfo.hasNextPage
    ) {
      this.fetchMoreTasks();
    }
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

  handleActionSubmit = ({ name }) => async () => {
    this.preRunningAction();

    const { taskActions, task } = this.props.data;
    const { actionInputs, actionData } = this.state;
    const form = actionInputs[name];
    const { action } = actionData[name];
    const taskId = await submitTaskAction({
      task,
      taskActions,
      form,
      action,
      apolloClient: this.props.client,
    });

    return taskId;
  };

  handleActionTaskComplete = taskId => {
    this.props.history.push(`/tasks/${taskId}`);
  };

  handleFormChange = (value, name) =>
    this.setState({
      actionInputs: {
        // eslint-disable-next-line react/no-access-state-in-setstate
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

  fetchMoreTasks = () => {
    const {
      data,
      match: {
        params: { taskGroupId },
      },
    } = this.props;
    const { fetchMore, taskGroup } = data;

    fetchMore({
      variables: {
        taskGroupId,
        taskGroupConnection: {
          limit: TASK_GROUP_PAGE_SIZE,
          cursor: taskGroup.pageInfo.nextCursor,
          previousCursor: taskGroup.pageInfo.cursor,
        },
        taskActionsFilter: {
          kind: {
            $in: ACTIONS_JSON_KNOWN_KINDS,
          },
          context: {
            $or: [{ $size: 0 }, { $size: 1 }],
          },
        },
      },
      updateQuery: (previousResult, { fetchMoreResult, variables }) => {
        if (
          variables.taskGroupConnection.previousCursor === this.previousCursor
        ) {
          const { edges, pageInfo } = fetchMoreResult.taskGroup;

          this.previousCursor = variables.taskGroupConnection.cursor;

          if (!edges.length) {
            return previousResult;
          }

          const filteredEdges = edges.filter(edge => {
            if (this.tasks.has(edge.node.taskId)) {
              return false;
            }

            this.tasks.set(edge.node.taskId);

            return true;
          });

          return dotProp.set(previousResult, 'taskGroup', taskGroup =>
            dotProp.set(
              dotProp.set(
                taskGroup,
                'edges',
                previousResult.taskGroup.edges.concat(filteredEdges)
              ),
              'pageInfo',
              pageInfo
            )
          );
        }
      },
    });
  };

  preRunningAction = () => {
    this.setState({ dialogError: null, actionLoading: true });
  };

  handleSearchTaskSubmit = searchTerm => {
    this.setState({ searchTerm });
  };

  handleNotifyDialogSubmit = () => {
    Object.entries(this.state.notifyPreferences).map(([key, checked]) =>
      db.userPreferences.put(checked, kebabCase(key))
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
    const {
      completed,
      exception,
      failed,
      pending,
      running,
      unscheduled,
    } = statusCount;
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

  getError(error) {
    if (!error) {
      return null;
    }

    if (typeof error === 'string') {
      return error;
    }

    // Task groups do not necessarily have a decision task,
    // so handle task-not-found errors gracefully
    return error.graphQLErrors.find(error => {
      return !(error.statusCode === 404 && error.requestInfo.method === 'task');
    });
  }

  render() {
    const {
      groupActions,
      filter,
      actionLoading,
      dialogOpen,
      selectedAction,
      actionInputs,
      dialogError,
      taskGroupLoaded,
      searchTerm,
      notifyDialogOpen,
      notifyPreferences,
    } = this.state;
    const bellIconSize = 16;
    const {
      description,
      match: {
        params: { taskGroupId },
      },
      data: { taskGroup, error, loading, subscribeToMore },
      classes,
    } = this.props;
    // Make sure data is not from another task group which
    // can happen when a user searches for a different task group
    const isFromSameTaskGroupId =
      taskGroup && taskGroup.edges[0]
        ? taskGroup.edges[0].node.taskGroupId === taskGroupId
        : true;
    const notificationsCount = Object.values(notifyPreferences).filter(Boolean)
      .length;
    const graphqlError = this.getError(error);

    this.subscribe({ taskGroupId, subscribeToMore });

    if (!this.tasks.size && taskGroup && isFromSameTaskGroupId) {
      taskGroup.edges.forEach(edge => this.tasks.set(edge.node.taskId));
    }

    return (
      <Dashboard
        title="Task Group"
        className={classes.dashboard}
        helpView={<HelpView description={description} />}
        search={
          <Search
            onSubmit={this.handleTaskGroupSearchSubmit}
            defaultValue={taskGroupId}
          />
        }>
        <ErrorPanel fixed error={graphqlError} warning={Boolean(taskGroup)} />
        {taskGroup && (
          <TaskGroupProgress
            taskGroupId={taskGroupId}
            taskGroupLoaded={taskGroupLoaded}
            taskGroup={taskGroup}
            filter={filter}
            onStatusClick={this.handleStatusClick}
            onUpdate={this.handleCountUpdate}
          />
        )}
        {!loading && taskGroup && (
          <Grid container>
            <Grid item xs={12} sm={9} className={classes.firstGrid}>
              <Search
                formProps={{ className: classes.taskNameFormSearch }}
                placeholder="Name contains"
                onSubmit={this.handleSearchTaskSubmit}
              />
            </Grid>
            <Grid item xs={12} sm={3} className={classes.secondGrid}>
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
        {!error && loading && <Spinner loading />}
        {!loading && taskGroup && (
          <TaskGroupTable
            searchTerm={searchTerm}
            filter={filter}
            taskGroupConnection={taskGroup}
          />
        )}
        {!loading && groupActions && groupActions.length ? (
          <SpeedDial>
            {groupActions.map(action => (
              <SpeedDialAction
                requiresAuth
                tooltipOpen
                key={action.title}
                FabProps={{
                  disabled: actionLoading,
                }}
                icon={<HammerIcon />}
                tooltipTitle={action.title}
                onClick={this.handleActionClick(action.name)}
              />
            ))}
          </SpeedDial>
        ) : null}
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
      </Dashboard>
    );
  }
}
