import { hot } from 'react-hot-loader';
import { Component } from 'react';
import { graphql } from 'react-apollo';
import dotProp from 'dot-prop-immutable';
import { lowerCase } from 'change-case';
import ErrorPanel from '@mozilla-frontend-infra/components/ErrorPanel';
import Spinner from '@mozilla-frontend-infra/components/Spinner';
import Dashboard from '../../../components/Dashboard';
import Search from '../../../components/Search';
import TaskGroupProgress from '../../../components/TaskGroupProgress';
import TaskGroupTable from '../../../components/TaskGroupTable';
import {
  TASK_GROUP_PAGE_SIZE,
  TASK_GROUP_POLLING_INTERVAL,
  VALID_TASK,
} from '../../../utils/constants';
import taskGroupQuery from './taskGroup.graphql';
import db from '../../../utils/db';

const updateTaskGroupIdHistory = id => {
  if (!VALID_TASK.test(id)) {
    return;
  }

  db.taskGroupIdsHistory.put({ taskGroupId: id });
};

@hot(module)
@graphql(taskGroupQuery, {
  options: props => ({
    pollInterval: TASK_GROUP_POLLING_INTERVAL,
    variables: {
      taskGroupId: props.match.params.taskGroupId,
      taskGroupConnection: {
        limit: TASK_GROUP_PAGE_SIZE,
      },
    },
  }),
})
export default class TaskGroup extends Component {
  state = {
    taskGroupSearch: '',
    filter: null,
    taskGroupProgressDisabled: false,
    // eslint-disable-next-line react/no-unused-state
    previousTaskGroupId: null,
  };

  static getDerivedStateFromProps(props, state) {
    const taskGroupId = props.match.params.taskGroupId || '';

    if (taskGroupId && !state.previousTaskGroupId) {
      return {
        taskGroupSearch: taskGroupId,
        previousTaskGroupId: taskGroupId,
        taskGroupProgressDisabled: true,
      };
    }

    if (taskGroupId) {
      updateTaskGroupIdHistory(taskGroupId);
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
                  $eq: lowerCase(filter),
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
                $eq: lowerCase(filter),
              },
            },
          }
        : null,
    });

    this.setState({ taskGroupProgressDisabled: false, filter });
  };

  render() {
    const { taskGroupSearch, filter, taskGroupProgressDisabled } = this.state;
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
      </Dashboard>
    );
  }
}
