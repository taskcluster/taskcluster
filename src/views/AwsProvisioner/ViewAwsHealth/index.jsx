import { hot } from 'react-hot-loader';
import React, { Component } from 'react';
import { graphql } from 'react-apollo';
import ErrorPanel from '@mozilla-frontend-infra/components/ErrorPanel';
import Spinner from '@mozilla-frontend-infra/components/Spinner';
import awsHealthQuery from './awsHealth.graphql';
import Dashboard from '../../../components/Dashboard';
import AwsProvisionerHealthTable from '../../../components/AwsProvisionerHealthTable';

@hot(module)
@graphql(awsHealthQuery)
export default class ViewAwsHealth extends Component {
  render() {
    const {
      data: { loading, error, awsProvisionerHealth },
    } = this.props;

    return (
      <Dashboard title="AWS Provisioner Health">
        {loading && <Spinner loading />}
        {error &&
          error.graphQLErrors && (
            <ErrorPanel error={error.graphQLErrors[0].message} />
          )}
        {awsProvisionerHealth && (
          <AwsProvisionerHealthTable healthData={awsProvisionerHealth} />
        )}
      </Dashboard>
    );
  }
}
