import { hot } from 'react-hot-loader';
import React, { Component } from 'react';
import { withApollo, graphql } from 'react-apollo';
import { bool } from 'prop-types';
import Dashboard from '../../../components/Dashboard';
import createWorkerPoolQuery from './createWorkerPool.graphql';
import workerPoolQuery from './workerPool.graphql';
import WMWorkerPoolEditor from '../../../components/WMWorkerPoolEditor';

const gcp = 'GCP';
const providers = new Map();
const providerConfigs = new Map();

providers.set(`${gcp}`, 'google');

providerConfigs.set(`${gcp}`, {
  minCapacity: 0,
  maxCapacity: 0,
  capacityPerInstance: 1,
  machineType: 'n1-highcpu-8',
  regions: ['us-west2'],
  userData: {},
  scheduling: {},
  networkInterfaces: [{}],
  disks: [{}],
});

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
      config: providerConfigs.get(gcp),
    },
    actionLoading: false,
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

  render() {
    const { isNewWorkerPool } = this.props;
    const { workerPool, actionLoading } = this.state;

    return (
      <Dashboard
        title={isNewWorkerPool ? 'Create Worker Pool' : 'Edit Worker Pool'}>
        <WMWorkerPoolEditor
          workerPool={workerPool}
          saveRequest={this.createWorkerPoolRequest}
          actionLoading={actionLoading}
        />
      </Dashboard>
    );
  }
}
