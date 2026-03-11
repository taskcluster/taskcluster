import React, { Component } from 'react';
import { Redirect } from 'react-router-dom';
import { graphql } from 'react-apollo';
import Spinner from '../../../../components/Spinner';
import Dashboard from '../../../../components/Dashboard';
import ErrorPanel from '../../../../components/ErrorPanel';
import artifactsQuery from './artifacts.graphql';
import indexedTaskQuery from './indexedTask.graphql';

@graphql(indexedTaskQuery, {
  name: 'indexedTaskData',
  options: props => ({
    variables: {
      indexPath: `${props.match.params.namespace}.${props.match.params.namespaceTaskId}`,
    },
  }),
})
@graphql(artifactsQuery, {
  name: 'latestArtifactsData',
  options: ({ indexedTaskData }) => ({
    variables: {
      skip: !indexedTaskData.indexedTask,
      taskId: indexedTaskData.indexedTask && indexedTaskData.indexedTask.taskId,
      entryConnection: {
        limit: 1, // we don't need much for redirect, but we need the task
      },
    },
  }),
})
export default class IndexedTaskTaskGroupRedirect extends Component {
  render() {
    const {
      latestArtifactsData: {
        task,
        error: latestArtifactsError,
        loading: latestArtifactsLoading,
      },
      indexedTaskData: {
        indexedTask,
        error: indexedTaskError,
        loading: indexedTaskLoading,
      },
    } = this.props;
    const loading = latestArtifactsLoading || indexedTaskLoading;

    return (
      <Dashboard title="Index Task Group Redirect">
        {loading && <Spinner loading />}
        {!loading && (
          <ErrorPanel fixed error={indexedTaskError || latestArtifactsError} />
        )}
        {indexedTask && task?.taskGroupId && (
          <Redirect to={`/tasks/groups/${task.taskGroupId}`} />
        )}
      </Dashboard>
    );
  }
}
