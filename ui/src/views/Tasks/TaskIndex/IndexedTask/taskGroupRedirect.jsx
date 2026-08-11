import React, { Component } from 'react';
import { Redirect } from 'react-router-dom';
import { Index, Queue } from '@taskcluster/client-web';
import Spinner from '../../../../components/Spinner';
import Dashboard from '../../../../components/Dashboard';
import ErrorPanel from '../../../../components/ErrorPanel';
import { withTaskclusterClient } from '../../../../utils/TaskclusterClient';
import withResource from '../../../../hocs/withResource';

@withTaskclusterClient
@withResource({
  name: 'taskGroup',
  fetch: props => async () => {
    const index = props.createTaskclusterClient({ Class: Index });
    const queue = props.createTaskclusterClient({ Class: Queue });
    const found = await index.findTask(
      `${props.match.params.namespace}.${props.match.params.namespaceTaskId}`
    );
    const task = await queue.task(found.taskId);

    return task.taskGroupId;
  },
  key: props =>
    `${props.match.params.namespace}.${props.match.params.namespaceTaskId}`,
})
export default class IndexedTaskTaskGroupRedirect extends Component {
  render() {
    const { data: taskGroupId, loading, error } = this.props.taskGroup;

    return (
      <Dashboard title="Index Task Group Redirect">
        {loading && <Spinner loading />}
        {!loading && <ErrorPanel fixed error={error} />}
        {!loading && taskGroupId && (
          <Redirect to={`/tasks/groups/${taskGroupId}`} />
        )}
      </Dashboard>
    );
  }
}
