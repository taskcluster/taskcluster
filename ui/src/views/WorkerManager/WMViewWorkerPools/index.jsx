import { hot } from 'react-hot-loader';
import React, { Component, Fragment } from 'react';
import { withApollo, graphql } from 'react-apollo';
import PlusIcon from 'mdi-react/PlusIcon';
import { withStyles } from '@material-ui/core';
import Spinner from '@mozilla-frontend-infra/components/Spinner';
import Dashboard from '../../../components/Dashboard';
import workerPoolsQuery from './WMWorkerPools.graphql';
import ErrorPanel from '../../../components/ErrorPanel';
import WorkerManagerWorkerPoolsTable from '../../../components/WMWorkerPoolsTable';
import Search from '../../../components/Search';
import Button from '../../../components/Button';
import updateWorkerPoolQuery from '../WMEditWorkerPool/updateWorkerPool.graphql';

@hot(module)
@withApollo
@graphql(workerPoolsQuery, {
  options: () => ({
    fetchPolicy: 'network-only', // so that it refreshes view after editing/creating
  }),
})
@withStyles(theme => ({
  createIconSpan: {
    ...theme.mixins.fab,
    ...theme.mixins.actionButton,
  },
}))
export default class WorkerManagerWorkerPoolsView extends Component {
  state = {
    workerPoolSearch: '',
  };

  handleWorkerPoolSearchSubmit = workerPoolSearch => {
    this.setState({ workerPoolSearch });
  };

  handleCreate = () => {
    this.props.history.push(`${this.props.match.path}/create`);
  };

  deleteRequest = async ({ workerPoolId, payload }) => {
    await this.props.client.mutate({
      mutation: updateWorkerPoolQuery,
      variables: {
        workerPoolId,
        payload: {
          ...payload,
          providerId: 'null-provider', // this is how we delete worker pools
        },
      },
      refetchQueries: ['workerPools'],
      awaitRefetchQueries: true,
    });
  };

  render() {
    const {
      data: { loading, error, WorkerManagerWorkerPoolSummaries },
      classes,
    } = this.props;
    const { workerPoolSearch } = this.state;

    return (
      <Dashboard
        title="Worker Pools"
        search={
          <Search
            disabled={loading}
            onSubmit={this.handleWorkerPoolSearchSubmit}
            placeholder="Worker pool contains"
          />
        }>
        <Fragment>
          {!WorkerManagerWorkerPoolSummaries && loading && <Spinner loading />}
          <ErrorPanel fixed error={error} />
          {WorkerManagerWorkerPoolSummaries && (
            <WorkerManagerWorkerPoolsTable
              searchTerm={workerPoolSearch}
              workerPools={WorkerManagerWorkerPoolSummaries}
              deleteRequest={this.deleteRequest}
            />
          )}
          <Button
            spanProps={{ className: classes.createIconSpan }}
            tooltipProps={{ title: 'Create Worker Pool' }}
            requiresAuth
            color="secondary"
            variant="round"
            onClick={this.handleCreate}>
            <PlusIcon />
          </Button>
        </Fragment>
      </Dashboard>
    );
  }
}
