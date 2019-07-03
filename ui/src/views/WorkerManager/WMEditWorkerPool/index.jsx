import { hot } from 'react-hot-loader';
import React, { Component, Fragment } from 'react';
import { withApollo, graphql } from 'react-apollo';
import { bool } from 'prop-types';
import Spinner from '@mozilla-frontend-infra/components/Spinner';
import Dashboard from '../../../components/Dashboard';
import createWorkerPoolQuery from './createWorkerPool.graphql';
import updateWorkerPoolQuery from './updateWorkerPool.graphql';
import workerPoolQuery from './workerPool.graphql';
import WMWorkerPoolEditor from '../../../components/WMWorkerPoolEditor';
import { findKeyInMap } from '../../../utils/mapUtils';
import {
  PROVIDERS,
  NULL_WORKER_POOL,
  NULL_PROVIDER,
} from '../../../utils/constants';

@hot(module)
@withApollo
@graphql(workerPoolQuery, {
  skip: props => !props.match.params.workerPoolId || props.isNewWorkerPool,
  options: ({ match: { params } }) => ({
    fetchPolicy: 'network-only',
    variables: {
      workerPoolId: decodeURIComponent(params.workerPoolId),
    },
  }),
})
export default class WMEditWorkerPool extends Component {
  static defaultProps = {
    isNewWorkerPool: true,
  };

  static propTypes = {
    isNewWorkerPool: bool,
  };

  createWorkerPoolRequest = async ({ workerPoolId, payload }) => {
    await this.props.client.mutate({
      mutation: createWorkerPoolQuery,
      variables: {
        workerPoolId,
        payload,
      },
    });
  };

  updateWorkerPoolRequest = async ({ workerPoolId, payload }) => {
    await this.props.client.mutate({
      mutation: updateWorkerPoolQuery,
      variables: {
        workerPoolId,
        payload,
      },
    });
  };

  deleteRequest = async ({ workerPoolId, payload }) => {
    await this.props.client.mutate({
      mutation: updateWorkerPoolQuery,
      variables: {
        workerPoolId,
        payload: {
          ...payload,
          providerId: NULL_PROVIDER, // this is how we delete worker pools
        },
      },
    });
  };

  render() {
    const { isNewWorkerPool, data } = this.props;

    return (
      <Dashboard
        title={isNewWorkerPool ? 'Create Worker Pool' : 'Edit Worker Pool'}>
        {isNewWorkerPool ? (
          <WMWorkerPoolEditor
            workerPool={NULL_WORKER_POOL}
            saveRequest={this.createWorkerPoolRequest}
            allowEditWorkerPoolId
          />
        ) : (
          <Fragment>
            {!data.WorkerPool && data.loading && <Spinner loading />}
            {data.WorkerPool && (
              <WMWorkerPoolEditor
                workerPool={data.WorkerPool}
                providerType={findKeyInMap({
                  map: PROVIDERS,
                  value: data.WorkerPool.providerId,
                })}
                saveRequest={this.updateWorkerPoolRequest}
                deleteRequest={this.deleteRequest}
              />
            )}
          </Fragment>
        )}
      </Dashboard>
    );
  }
}
