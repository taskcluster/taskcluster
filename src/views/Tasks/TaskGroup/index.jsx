import { hot } from 'react-hot-loader';
import { Component } from 'react';
import { graphql, withApollo } from 'react-apollo';
import dotProp from 'dot-prop-immutable';
import { isEmpty } from 'ramda';
import jsonSchemaDefaults from 'json-schema-defaults';
import { safeDump } from 'js-yaml';
import { withStyles } from '@material-ui/core/styles';
import ErrorPanel from '@mozilla-frontend-infra/components/ErrorPanel';
import Spinner from '@mozilla-frontend-infra/components/Spinner';
import HammerIcon from 'mdi-react/HammerIcon';
import SpeedDial from '../../../components/SpeedDial';
import SpeedDialAction from '../../../components/SpeedDialAction';
import Dashboard from '../../../components/Dashboard';
import Search from '../../../components/Search';
import DialogAction from '../../../components/DialogAction';
import TaskGroupProgress from '../../../components/TaskGroupProgress';
import TaskGroupTable from '../../../components/TaskGroupTable';
import TaskActionForm from '../../../components/TaskActionForm';
import {
  TASK_GROUP_PAGE_SIZE,
  TASK_GROUP_POLLING_INTERVAL,
  VALID_TASK,
  ACTIONS_JSON_KNOWN_KINDS,
} from '../../../utils/constants';
import taskGroupQuery from './taskGroup.graphql';
import db from '../../../utils/db';
import submitTaskAction from '../submitTaskAction';

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
    pollInterval: TASK_GROUP_POLLING_INTERVAL,
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
@withStyles(theme => ({
  code: {
    maxHeight: '70vh',
    margin: 0,
  },
  codeEditor: {
    overflow: 'auto',
    maxHeight: '70vh',
  },
  description: {
    marginBottom: theme.spacing.triple,
  },
}))
export default class TaskGroup extends Component {
  state = {
    taskGroupSearch: '',
    filter: null,
    taskGroupProgressDisabled: false,
    // eslint-disable-next-line react/no-unused-state
    previousTaskGroupId: null,
    groupActions: [],
    actionLoading: false,
    actionInputs: {},
    actionData: {},
    dialogOpen: false,
    selectedAction: null,
    dialogError: null,
  };

  static getDerivedStateFromProps(props, state) {
    const taskGroupId = props.match.params.taskGroupId || '';
    const { taskActions } = props.data;
    const groupActions = [];
    const actionInputs = state.actionInputs || {};
    const actionData = state.actionData || {};

    if (taskGroupId !== state.previousTaskGroupId && taskActions) {
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
        taskGroupSearch: taskGroupId,
        previousTaskGroupId: taskGroupId,
        taskGroupProgressDisabled: true,
      };
    }

    return null;
  }

  componentDidUpdate(prevProps) {
    const { taskGroupId } = this.props.match.params;

    if (prevProps.match.params.taskGroupId !== taskGroupId) {
      updateTaskGroupIdHistory(taskGroupId);
    }
  }

  handleTaskGroupSearchChange = ({ target: { value } }) => {
    this.setState({ taskGroupSearch: value || '' });
  };

  handleTaskGroupSearchSubmit = e => {
    e.preventDefault();

    const { taskGroupSearch } = this.state;

    if (this.props.match.params.taskGroupId !== taskGroupSearch) {
      this.props.history.push(`/tasks/groups/${this.state.taskGroupSearch}`);
    }

    this.setState({ taskGroupProgressDisabled: true });
  };

  handlePageChange = ({ cursor, previousCursor }) => {
    const {
      match: {
        params: { taskGroupId },
      },
      data: { fetchMore },
    } = this.props;
    const { filter } = this.state;

    return fetchMore({
      query: taskGroupQuery,
      variables: {
        taskGroupId,
        filter: filter
          ? {
              status: {
                state: {
                  $eq: filter,
                },
              },
            }
          : null,
        taskGroupConnection: {
          limit: TASK_GROUP_PAGE_SIZE,
          cursor,
          previousCursor,
        },
      },
      updateQuery(previousResult, { fetchMoreResult }) {
        const { edges, pageInfo } = fetchMoreResult.taskGroup;

        if (!edges.length) {
          return previousResult;
        }

        return dotProp.set(previousResult, 'taskGroup', taskGroup =>
          dotProp.set(
            dotProp.set(taskGroup, 'edges', edges),
            'pageInfo',
            pageInfo
          )
        );
      },
    });
  };

  handleCountUpdate = () => {
    this.setState({ taskGroupProgressDisabled: false });
  };

  handleStatusClick = async ({ target: { name } }) => {
    const {
      data: { refetch },
      match: {
        params: { taskGroupId },
      },
    } = this.props;
    const filter = this.state.filter === name ? null : name;

    this.setState({ taskGroupProgressDisabled: true });
    await refetch({
      taskGroupId,
      taskGroupConnection: {
        limit: TASK_GROUP_PAGE_SIZE,
      },
      filter: filter
        ? {
            status: {
              state: {
                $eq: filter,
              },
            },
          }
        : null,
    });

    this.setState({ taskGroupProgressDisabled: false, filter });
  };

  handleFormChange = (value, name) =>
    this.setState({
      actionInputs: {
        ...this.state.actionInputs,
        [name]: value,
      },
    });

  handleActionClick = ({ target: { name } }) => {
    const { action } = this.state.actionData[name];

    this.setState({ dialogOpen: true, selectedAction: action });
  };

  handleActionDialogClose = () => {
    this.setState({
      dialogOpen: false,
      selectedAction: null,
      dialogError: null,
      actionLoading: false,
    });
  };

  handleActionTaskComplete = taskId => {
    this.props.history.push(`/tasks/${taskId}`);
  };

  preRunningAction = () => {
    this.setState({ dialogError: null, actionLoading: true });
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

  handleActionError = e => {
    this.setState({ dialogError: e, actionLoading: false });
  };

  handleActionComplete = taskId => {
    this.handleActionDialogClose();
    this.handleActionTaskComplete(taskId);
  };

  render() {
    const {
      groupActions,
      taskGroupSearch,
      filter,
      actionLoading,
      taskGroupProgressDisabled,
      dialogOpen,
      selectedAction,
      actionInputs,
      dialogError,
    } = this.state;
    const {
      match: {
        params: { taskGroupId },
      },
      data: { loading, error, taskGroup },
    } = this.props;

    return (
      <Dashboard
        search={
          <Search
            value={taskGroupSearch}
            onChange={this.handleTaskGroupSearchChange}
            onSubmit={this.handleTaskGroupSearchSubmit}
          />
        }>
        {error &&
          error.graphQLErrors && (
            <ErrorPanel error={error.graphQLErrors[0].message} />
          )}
        <TaskGroupProgress
          taskGroupId={taskGroupId}
          disabled={taskGroupProgressDisabled}
          filter={filter}
          onStatusClick={this.handleStatusClick}
          onCountUpdate={this.handleCountUpdate}
        />
        <br />
        {loading && <Spinner loading />}
        {taskGroup && (
          <TaskGroupTable
            onPageChange={this.handlePageChange}
            taskGroupConnection={taskGroup}
          />
        )}
        {groupActions && groupActions.length ? (
          <SpeedDial>
            {groupActions.map(action => (
              <SpeedDialAction
                requiresAuth
                tooltipOpen
                key={action.title}
                ButtonProps={{
                  name: action.name,
                  color: 'primary',
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
