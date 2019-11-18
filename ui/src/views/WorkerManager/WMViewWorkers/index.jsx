import { hot } from 'react-hot-loader';
import React, { Component } from 'react';
import { graphql } from 'react-apollo';
import { withRouter } from 'react-router-dom';
import Spinner from '@mozilla-frontend-infra/components/Spinner';
import Tab from '@material-ui/core/Tab/Tab';
import Tabs from '@material-ui/core/Tabs/Tabs';
import Dashboard from '../../../components/Dashboard';
import ErrorPanel from '../../../components/ErrorPanel';
import WorkerManagerWorkersTable from '../../../components/WMWorkersTable';
import workersQuery from './WMWorkers.graphql';
import Search from '../../../components/Search';

@hot(module)
@withRouter
@graphql(workersQuery, {
  options: props => ({
    variables: {
      workerPool: props.match.params.workerPool,
      provider: props.match.params.provider,
    },
  }),
})
export default class WMViewWorkers extends Component {
  state = {
    currentTab: 0,
    workerSearch: '',
  };

  handleTabChange = (e, currentTab) => {
    this.setState({ currentTab });
  };

  handleWorkerSearchSubmit = workerSearch => {
    this.setState({ workerSearch });
  };

  render() {
    const { currentTab, workerSearch } = this.state;
    const {
      data: { loading, error, WorkerManagerWorkers },
    } = this.props;

    return (
      <Dashboard
        title={`Workers for ${this.props.match.params.workerPool ||
          this.props.match.params.provider}`}
        search={
          <Search
            disabled={loading}
            onSubmit={this.handleWorkerSearchSubmit}
            placeholder="Worker name contains"
          />
        }>
        <ErrorPanel fixed error={this.state.error || error} />

        <Tabs value={currentTab} onChange={this.handleTabChange}>
          <Tab label="Failures and Exceptions" />
          <Tab label="Pending" />
          <Tab label="Running" />
        </Tabs>

        {loading && <Spinner loading />}

        {!error && !loading && currentTab === 0 && (
          <WorkerManagerWorkersTable
            searchTerm={workerSearch}
            workers={WorkerManagerWorkers}
          />
        )}
      </Dashboard>
    );
  }
}
