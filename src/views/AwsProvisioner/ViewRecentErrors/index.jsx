import { hot } from 'react-hot-loader';
import React, { Component } from 'react';
import { graphql } from 'react-apollo';
import Spinner from '@mozilla-frontend-infra/components/Spinner';
import recentErrors from './recentErrors.graphql';
import Dashboard from '../../../components/Dashboard';
import AwsProvisionerErrorsTable from '../../../components/AwsProvisionerErrorsTable';
import ErrorPanel from '../../../components/ErrorPanel';

@hot(module)
@graphql(recentErrors)
export default class ViewRecentErrors extends Component {
  render() {
    const {
      data: { loading, error, awsProvisionerRecentErrors },
    } = this.props;

    return (
      <Dashboard title="AWS Provisioner Recent Errors">
        {loading && <Spinner loading />}
        <ErrorPanel error={error} />
        {awsProvisionerRecentErrors && (
          <AwsProvisionerErrorsTable errors={awsProvisionerRecentErrors} />
        )}
      </Dashboard>
    );
  }
}
