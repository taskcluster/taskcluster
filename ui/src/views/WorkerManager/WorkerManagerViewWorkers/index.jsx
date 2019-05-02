import { hot } from 'react-hot-loader';
import React, { Component } from 'react';
import Dashboard from '../../../components/Dashboard';
import ErrorPanel from '../../../components/ErrorPanel';
import Tabs from '@material-ui/core/Tabs/Tabs';
import Tab from '@material-ui/core/Tab/Tab';
import Spinner from '@mozilla-frontend-infra/components/Spinner';
import WorkerManagerWorkersTable from '../../../components/WorkerManagerWorkersTable';
import {graphql} from 'react-apollo';
import workersQuery from 'WorkerManagerWorkers.graphql';

@hot(module)
@graphql(workersQuery)
export default class WorkerManagerViewWorkers extends Component {
  state = {
    currentTab: 0,
  };

  handleTabChange = (e, currentTab) => {
    this.setState({ currentTab });
  };

  render() {
    const {currentTab} = this.state;
    const {
      data: { loading, error, WorkerManagerWorkerSummaries },
    } = this.props;

    return <Dashboard title={`${workerType} - Workers`}>
      <ErrorPanel error={error} />
      <ErrorPanel error={this.state.error} />

      <Tabs fullWidth value={currentTab} onChange={this.handleTabChange}>
        <Tab label="Failures and Exceptions" />
        <Tab label="Pending" />
        <Tab label="Running" />
      </Tabs>

      {loading && <Spinner className={classes.spinner} loading />}

      {!error && !loading && currentTab === 0 && (
        <WorkerManagerWorkersTable/>
      )}

    </Dashboard>;
  }
}
