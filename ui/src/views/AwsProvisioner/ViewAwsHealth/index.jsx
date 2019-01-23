import { hot } from 'react-hot-loader';
import React, { Component } from 'react';
import { graphql } from 'react-apollo';
import Spinner from '@mozilla-frontend-infra/components/Spinner';
import awsHealthQuery from './awsHealth.graphql';
import Dashboard from '../../../components/Dashboard';
import AwsProvisionerHealthTable from '../../../components/AwsProvisionerHealthTable';
import ErrorPanel from '../../../components/ErrorPanel';

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
        <ErrorPanel error={error} />
        {awsProvisionerHealth && (
          <AwsProvisionerHealthTable healthData={awsProvisionerHealth} />
        )}
      </Dashboard>
    );
  }
}
