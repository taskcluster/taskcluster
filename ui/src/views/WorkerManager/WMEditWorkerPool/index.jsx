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
import { PROVIDER_CONFIGS, PROVIDERS, GCP } from '../../../utils/constants';

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

  state = {
    workerPool: {
      workerPoolId1: '',
      workerPoolId2: '',
      description: '',
      owner: '',
      emailOnError: false,
      config: PROVIDER_CONFIGS.get(GCP),
    },
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

  render() {
    const { isNewWorkerPool, data } = this.props;
    const { workerPool, providerType } = this.state;

    return (
      <Dashboard
        title={isNewWorkerPool ? 'Create Worker Pool' : 'Edit Worker Pool'}>
        {isNewWorkerPool ? (
          <WMWorkerPoolEditor
            workerPool={workerPool}
            providerType={providerType}
            saveRequest={this.createWorkerPoolRequest}
            allowEditWorkerPoolId
          />
        ) : (
          <Fragment>
            {!data.WorkerPool && data.loading && <Spinner loading />}
            {data.WorkerPool && (
              <WMWorkerPoolEditor
                workerPool={data.WorkerPool}
                providerType={GCP}
                saveRequest={this.updateWorkerPoolRequest}
              />
            )}
          </Fragment>
        )}
      </Dashboard>
    );
  }
}
