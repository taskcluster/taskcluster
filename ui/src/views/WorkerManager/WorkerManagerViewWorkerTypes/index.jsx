import { hot } from 'react-hot-loader';
import React, { Component, Fragment } from 'react';
import { graphql } from 'react-apollo';
import Spinner from '@mozilla-frontend-infra/components/Spinner';
import Dashboard from '../../../components/Dashboard';
import workerTypesQuery from './WorkerManagerWorkerTypes.graphql';
import ErrorPanel from '../../../components/ErrorPanel';
import WorkerManagerWorkerTypesTable from '../../../components/WorkerManagerWorkerTypesTable';
import Search from '../../../components/Search';

@hot(module)
@graphql(workerTypesQuery)
export default class WorkerManagerWorkerTypesView extends Component {
  state = {
    workerTypeSearch: '',
  };

  handleWorkerTypeSearchSubmit = workerTypeSearch => {
    this.setState({ workerTypeSearch });
  };

  render() {
    const {
      data: { loading, error, WorkerManagerWorkerTypeSummaries },
    } = this.props;
    const { workerTypeSearch } = this.state;

    return (
      <Dashboard
        title="Worker Types"
        search={
          <Search
            disabled={loading}
            onSubmit={this.handleWorkerTypeSearchSubmit}
            placeholder="Worker type contains"
          />
        }>
        <Fragment>
          {!WorkerManagerWorkerTypeSummaries && loading && <Spinner loading />}
          <ErrorPanel error={error} />
          {WorkerManagerWorkerTypeSummaries && (
            <WorkerManagerWorkerTypesTable
              searchTerm={workerTypeSearch}
              workerTypes={WorkerManagerWorkerTypeSummaries}
            />
          )}
        </Fragment>
      </Dashboard>
    );
  }
}
