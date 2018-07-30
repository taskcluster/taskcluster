import { hot } from 'react-hot-loader';
import { Component, Fragment } from 'react';
import { graphql } from 'react-apollo';
import ErrorPanel from '@mozilla-frontend-infra/components/ErrorPanel';
import Spinner from '@mozilla-frontend-infra/components/Spinner';
import Dashboard from '../../../components/Dashboard';
import ClientForm from '../../../components/ClientForm';
import clientQuery from './client.graphql';

@hot(module)
@graphql(clientQuery, {
  skip: ({ match: { params } }) => !params.clientId,
  options: ({ match: { params } }) => ({
    variables: {
      clientId: decodeURIComponent(params.clientId),
    },
  }),
})
export default class ViewClient extends Component {
  render() {
    const { user, onSignIn, onSignOut, isNewClient, data } = this.props;

    return (
      <Dashboard
        title={isNewClient ? 'Create Client' : 'Client'}
        user={user}
        onSignIn={onSignIn}
        onSignOut={onSignOut}>
        {isNewClient ? (
          <ClientForm isNewClient />
        ) : (
          <Fragment>
            {data.loading && <Spinner loading />}
            {data &&
              data.error &&
              data.error.graphQLErrors && (
                <ErrorPanel error={data.error.graphQLErrors[0].message} />
              )}
            {data && data.client && <ClientForm client={data.client} />}
          </Fragment>
        )}
      </Dashboard>
    );
  }
}
