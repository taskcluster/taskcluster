import { hot } from 'react-hot-loader';
import { Component, Fragment } from 'react';
import { graphql } from 'react-apollo';
import Dashboard from '../../../components/Dashboard';
import Spinner from '../../../components/Spinner';
import ErrorPanel from '../../../components/ErrorPanel';
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
        title="Client"
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
