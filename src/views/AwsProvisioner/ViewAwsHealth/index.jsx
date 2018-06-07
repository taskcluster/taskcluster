import { hot } from 'react-hot-loader';
import { Component } from 'react';
import { graphql } from 'react-apollo';
import awsHealthQuery from './awsHealth.graphql';
import Dashboard from '../../../components/Dashboard';
import ErrorPanel from '../../../components/ErrorPanel';
import AwsProvisionerHealthTable from '../../../components/AwsProvisionerHealthTable';
import Spinner from '../../../components/Spinner';

@hot(module)
@graphql(awsHealthQuery)
export default class ViewAwsHealth extends Component {
  render() {
    const {
      user,
      onSignIn,
      onSignOut,
      data: { loading, error, awsProvisionerHealth },
    } = this.props;

    return (
      <Dashboard
        title="AWS Provisioner Health"
        user={user}
        onSignIn={onSignIn}
        onSignOut={onSignOut}>
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
