import { hot } from 'react-hot-loader';
import React, { Component } from 'react';
import { graphql, withApollo } from 'react-apollo';
import dotProp from 'dot-prop-immutable';
import { isEmpty } from 'ramda';
import jsonSchemaDefaults from 'json-schema-defaults';
import { safeDump } from 'js-yaml';
import Spinner from '@mozilla-frontend-infra/components/Spinner';
import HammerIcon from 'mdi-react/HammerIcon';
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
  TASK_GROUP_POLLING_INTERVAL,
  VALID_TASK,
  ACTIONS_JSON_KNOWN_KINDS,
  INITIAL_CURSOR,
} from '../../../utils/constants';
import db from '../../../utils/db';
import ErrorPanel from '../../../components/ErrorPanel';
import taskGroupQuery from './taskGroup.graphql';
import submitTaskAction from '../submitTaskAction';

const updateTaskGroupIdHistory = id => {
  if (!VALID_TASK.test(id)) {
    return;
  }

  db.taskGroupIdsHistory.put({ taskGroupId: id });
};

let previousCursor;

@hot(module)
@withApollo
@graphql(taskGroupQuery, {
  options: props => ({
    pollInterval: TASK_GROUP_POLLING_INTERVAL,
    errorPolicy: 'all',
    variables: {
      taskGroupId: props.match.params.taskGroupId,
      taskGroupConnection: {
        limit: TASK_GROUP_PAGE_SIZE,
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
export default class TaskGroup extends Component {
  static getDerivedStateFromProps(props, state) {
    const taskGroupId = props.match.params.taskGroupId || '';
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
    };
  }

  constructor(props) {
    super(props);

    previousCursor = INITIAL_CURSOR;
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
  };

  componentDidUpdate(prevProps) {
    const {
      data: { taskGroup },
      match: {
        params: { taskGroupId },
      },
    } = this.props;

    if (prevProps.match.params.taskGroupId !== taskGroupId) {
      updateTaskGroupIdHistory(taskGroupId);
    }

    if (
      taskGroup &&
      previousCursor === taskGroup.pageInfo.cursor &&
      taskGroup.pageInfo.hasNextPage
    ) {
      this.fetchMoreTasks();
    }
  }

  handleActionClick = ({ target: { name } }) => {
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
      updateQuery(previousResult, { fetchMoreResult, variables }) {
        if (variables.taskGroupConnection.previousCursor === previousCursor) {
          const { edges, pageInfo } = fetchMoreResult.taskGroup;

          if (!pageInfo.hasNextPage) {
            // Resetting to the initial cursor will allow us to
            // capture updates since the query has a polling interval
            previousCursor = INITIAL_CURSOR;
          } else {
            previousCursor = variables.taskGroupConnection.cursor;
          }

          if (!edges.length) {
            return previousResult;
          }

          const result = dotProp.set(previousResult, 'taskGroup', taskGroup =>
            dotProp.set(
              dotProp.set(
                taskGroup,
                'edges',
                previousResult.taskGroup.edges.concat(edges)
              ),
              'pageInfo',
              pageInfo
            )
          );

          return result;
        }
      },
    });
  };

  preRunningAction = () => {
    this.setState({ dialogError: null, actionLoading: true });
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
      taskGroupLoaded,
    } = this.state;
    const {
      description,
      match: {
        params: { taskGroupId },
      },
      data: { taskGroup, error, loading },
    } = this.props;

    return (
      <Dashboard
        helpView={<HelpView description={description} />}
        search={<Search onSubmit={this.handleTaskGroupSearchSubmit} />}>
        <ErrorPanel error={error} warning={Boolean(taskGroup)} />
        {taskGroup && (
          <TaskGroupProgress
            taskGroup={taskGroup}
            taskGroupId={taskGroupId}
            filter={filter}
            onStatusClick={this.handleStatusClick}
          />
        )}
        <br />
        {!error && !taskGroupLoaded && <Spinner loading />}
        {!loading &&
          taskGroupLoaded && (
            <TaskGroupTable filter={filter} taskGroupConnection={taskGroup} />
          )}
        {!loading && groupActions && groupActions.length ? (
          <SpeedDial>
            {groupActions.map(action => (
              <SpeedDialAction
                requiresAuth
                tooltipOpen
                key={action.title}
                ButtonProps={{
                  name: action.name,
                  disabled: actionLoading,
                }}
                icon={<HammerIcon />}
                tooltipTitle={action.title}
                onClick={this.handleActionClick}
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
      </Dashboard>
    );
  }
}
