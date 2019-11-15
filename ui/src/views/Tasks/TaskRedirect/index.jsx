import { hot } from 'react-hot-loader';
import React, { Component, Fragment } from 'react';
import { Redirect } from 'react-router-dom';
import { graphql } from 'react-apollo';
import cloneDeep from 'lodash.clonedeep';
import Spinner from '@mozilla-frontend-infra/components/Spinner';
import Dashboard from '../../../components/Dashboard';
import ErrorPanel from '../../../components/ErrorPanel';
import parameterizeTask from '../../../utils/parameterizeTask';
import removeKeys from '../../../utils/removeKeys';
import taskQuery from './task.graphql';

@hot(module)
@graphql(taskQuery, {
  options: props => ({
    variables: {
      taskId: props.match.params.taskId,
    },
  }),
})
export default class TaskRedirect extends Component {
  render() {
    const {
      match: {
        params: { action },
      },
      data: { loading, error, task },
    } = this.props;
    // Apollo feature request: https://github.com/apollographql/apollo-feature-requests/issues/6
    const sanitizedTask = task && removeKeys(cloneDeep(task), ['__typename']);

    return (
      <Dashboard>
        <Fragment>
          {error ? (
            <ErrorPanel fixed error={error} />
          ) : (
            <Fragment>
              {loading && <Spinner />}
              {!loading && task && (
                <Redirect
                  to={{
                    pathname:
                      action === 'interactive'
                        ? '/tasks/create?interactive=1'
                        : '/tasks/create',
                    state: {
                      task:
                        action === 'interactive'
                          ? parameterizeTask(sanitizedTask)
                          : sanitizedTask,
                    },
                  }}
                />
              )}
            </Fragment>
          )}
        </Fragment>
      </Dashboard>
    );
  }
}
