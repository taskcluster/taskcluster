import { hot } from 'react-hot-loader';
import React, { Component } from 'react';
import { withApollo, graphql } from 'react-apollo';
import { bool } from 'prop-types';
import Spinner from '@mozilla-frontend-infra/components/Spinner';
import Dashboard from '../../../components/Dashboard';
import createWorkerPoolQuery from './createWorkerPool.graphql';
import updateWorkerPoolQuery from './updateWorkerPool.graphql';
import workerPoolQuery from './workerPool.graphql';
import providersQuery from './providers.graphql';
import WMWorkerPoolEditor from '../../../components/WMWorkerPoolEditor';
import ErrorPanel from '../../../components/ErrorPanel';
import { NULL_PROVIDER } from '../../../utils/constants';

@hot(module)
@withApollo
@graphql(providersQuery, {
  name: 'providersData',
})
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
  state = {
    dialogError: null,
    dialogOpen: false,
  };

  static defaultProps = {
    isNewWorkerPool: false,
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

  deleteRequest = ({ workerPoolId, payload }) => {
    this.setState({ dialogError: null });

    return this.props.client.mutate({
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

  handleDialogActionError = error => {
    this.setState({ dialogError: error });
  };

  handleDialogActionComplete = () => {
    this.props.history.push('/worker-manager');
  };

  handleDialogActionClose = () => {
    this.setState({
      dialogOpen: false,
      dialogError: null,
    });
  };

  handleDialogActionOpen = () => {
    this.setState({ dialogOpen: true });
  };

  render() {
    const { dialogError, dialogOpen } = this.state;
    const { isNewWorkerPool, data, providersData } = this.props;

    // detect a ridiculous number of providers and let the user know
    if (
      providersData.WorkerManagerProviders &&
      providersData.WorkerManagerProviders.pageInfo.hasNextPage
    ) {
      const err = new Error(
        'This deployment has a lot of providers; not all can be displayed here.'
      );

      return <ErrorPanel fixed error={err} />;
    }

    const providers = providersData.WorkerManagerProviders
      ? providersData.WorkerManagerProviders.edges.map(({ node }) => node)
      : [];
    const loading =
      !providersData ||
      !providersData.WorkerManagerProviders ||
      providersData.loading ||
      (!isNewWorkerPool && (!data || !data.WorkerPool || data.loading));
    const error =
      (providersData && providersData.error) || (data && data.error);

    return (
      <Dashboard title={isNewWorkerPool ? 'Create Worker Pool' : 'Worker Pool'}>
        <ErrorPanel fixed error={error} />
        {loading && <Spinner loading />}
        {!loading &&
          (isNewWorkerPool ? (
            <WMWorkerPoolEditor
              saveRequest={this.createWorkerPoolRequest}
              providers={providers}
              isNewWorkerPool
            />
          ) : (
            <WMWorkerPoolEditor
              workerPool={data.WorkerPool}
              providers={providers}
              saveRequest={this.updateWorkerPoolRequest}
              deleteRequest={this.deleteRequest}
              dialogError={dialogError}
              dialogOpen={dialogOpen}
              onDialogActionError={this.handleDialogActionError}
              onDialogActionComplete={this.handleDialogActionComplete}
              onDialogActionClose={this.handleDialogActionClose}
              onDialogActionOpen={this.handleDialogActionOpen}
            />
          ))}
      </Dashboard>
    );
  }
}
