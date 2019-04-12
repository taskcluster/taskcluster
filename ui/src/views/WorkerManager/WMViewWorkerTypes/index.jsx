import { hot } from 'react-hot-loader';
import React, { Component } from 'react';
import { graphql } from 'react-apollo';
import Spinner from '@mozilla-frontend-infra/components/Spinner';
import Dashboard from '../../../components/Dashboard';
import workerTypesQuery from './WMWorkerTypes.graphql';
import ErrorPanel from '../../../components/ErrorPanel';
import WMWorkerTypesTable from '../../../components/WMWorkerTypesTable';
import Search from '../../../components/Search';

@hot(module)
@graphql(workerTypesQuery)
export default class WMWorkerTypesView extends Component {
  state = {
    workerTypeSearch: '',
  };

  handleWorkerTypeSearchSubmit = workerTypeSearch => {
    this.setState({ workerTypeSearch });
  };

  render() {
    const {
      data: { loading, error, WMWorkerTypeSummaries },
      match: { path },
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
        <>
          {!WMWorkerTypeSummaries && loading && <Spinner loading />}
          <ErrorPanel error={error} />
          {WMWorkerTypeSummaries && (
            <WMWorkerTypesTable
              searchTerm={workerTypeSearch}
              workerTypes={WMWorkerTypeSummaries}
              path={path}
            />
          )}
        </>
      </Dashboard>
    );
  }
}
