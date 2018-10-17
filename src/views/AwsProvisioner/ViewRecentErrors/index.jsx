import { hot } from 'react-hot-loader';
import React, { Component } from 'react';
import { graphql } from 'react-apollo';
import ErrorPanel from '@mozilla-frontend-infra/components/ErrorPanel';
import Spinner from '@mozilla-frontend-infra/components/Spinner';
import recentErrors from './recentErrors.graphql';
import Dashboard from '../../../components/Dashboard';
import AwsProvisionerErrorsTable from '../../../components/AwsProvisionerErrorsTable';

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
        {error &&
          error.graphQLErrors && (
            <ErrorPanel error={error.graphQLErrors[0].message} />
          )}
        {awsProvisionerRecentErrors && (
          <AwsProvisionerErrorsTable errors={awsProvisionerRecentErrors} />
        )}
      </Dashboard>
    );
  }
}
