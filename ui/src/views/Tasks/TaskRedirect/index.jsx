import cloneDeep from 'lodash.clonedeep';
import { Component, Fragment } from 'react';
import { graphql } from 'react-apollo';
import { Redirect } from 'react-router-dom';
import Dashboard from '../../../components/Dashboard';
import ErrorPanel from '../../../components/ErrorPanel';
import Spinner from '../../../components/Spinner';
import parameterizeTask from '../../../utils/parameterizeTask';
import removeKeys from '../../../utils/removeKeys';
import taskQuery from './task.graphql';

@graphql(taskQuery, {
  options: (props) => ({
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
                    pathname: action === 'interactive' ? '/tasks/create?interactive=1' : '/tasks/create',
                    state: {
                      task: action === 'interactive' ? parameterizeTask(sanitizedTask) : sanitizedTask,
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
