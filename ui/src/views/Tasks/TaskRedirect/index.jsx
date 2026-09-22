import React, { Component, Fragment } from 'react';
import { Redirect } from 'react-router-dom';
import { Queue } from '@taskcluster/client-web';
import { omit } from 'ramda';
import Spinner from '../../../components/Spinner';
import Dashboard from '../../../components/Dashboard';
import ErrorPanel from '../../../components/ErrorPanel';
import parameterizeTask from '../../../utils/parameterizeTask';
import { withTaskclusterClient } from '../../../utils/TaskclusterClient';
import withResource from '../../../hocs/withResource';

@withTaskclusterClient
@withResource({
  fetch: props => {
    return () => {
      return props
        .createTaskclusterClient({ Class: Queue })
        .task(props.match.params.taskId);
    };
  },
  key: props => {
    return props.match.params.taskId;
  },
})
export default class TaskRedirect extends Component {
  render() {
    const {
      match: {
        params: { action },
      },
      data: task,
      loading,
      error,
    } = this.props;
    // Like the Edit action on the task view, leave out `taskGroupId` so the
    // new task is created in a group of its own.
    const editableTask = task && omit(['taskGroupId'], task);

    return (
      <Dashboard>
        {error ? (
          <ErrorPanel fixed error={error} />
        ) : (
          <Fragment>
            {loading && <Spinner />}
            {!loading && task && (
              <Redirect
                to={{
                  pathname: '/tasks/create',
                  search: action === 'interactive' ? '?interactive=1' : '',
                  state: {
                    task:
                      action === 'interactive'
                        ? parameterizeTask(editableTask)
                        : editableTask,
                  },
                }}
              />
            )}
          </Fragment>
        )}
      </Dashboard>
    );
  }
}
