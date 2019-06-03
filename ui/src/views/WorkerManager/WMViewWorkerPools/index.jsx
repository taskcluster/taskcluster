import { hot } from 'react-hot-loader';
import React, { Component, Fragment } from 'react';
import { graphql } from 'react-apollo';
import Spinner from '@mozilla-frontend-infra/components/Spinner';
import Dashboard from '../../../components/Dashboard';
import workerPoolsQuery from './WMWorkerPools.graphql';
import ErrorPanel from '../../../components/ErrorPanel';
import WorkerManagerWorkerPoolsTable from '../../../components/WMWorkerPoolsTable';
import Search from '../../../components/Search';

@hot(module)
@graphql(workerPoolsQuery)
export default class WorkerManagerWorkerPoolsView extends Component {
  state = {
    workerPoolSearch: '',
  };

  handleWorkerPoolSearchSubmit = workerPoolSearch => {
    this.setState({ workerPoolSearch });
  };

  render() {
    const {
      data: { loading, error, WorkerManagerWorkerPoolSummaries },
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
            />
          )}
        </Fragment>
      </Dashboard>
    );
  }
}
