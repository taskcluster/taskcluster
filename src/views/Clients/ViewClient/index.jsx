import { hot } from 'react-hot-loader';
import { Component, Fragment } from 'react';
import { graphql, withApollo } from 'react-apollo';
import ErrorPanel from '@mozilla-frontend-infra/components/ErrorPanel';
import Spinner from '@mozilla-frontend-infra/components/Spinner';
import Dashboard from '../../../components/Dashboard';
import ClientForm from '../../../components/ClientForm';
import updateClientQuery from './updateClient.graphql';
import createClientQuery from './createClient.graphql';
import deleteClientQuery from './deleteClient.graphql';
import disableClientQuery from './disableClient.graphql';
import enableClientQuery from './enableClient.graphql';
// import resetAccessTokenQuery from './resetAccessToken.graphql';
import clientQuery from './client.graphql';

@hot(module)
@withApollo
@graphql(clientQuery, {
  skip: ({ match: { params } }) => !params.clientId,
  options: ({ match: { params } }) => ({
    variables: {
      clientId: decodeURIComponent(params.clientId),
    },
  }),
})
export default class ViewClient extends Component {
  state = {
    loading: false,
    error: null,
  };

  handleSaveClient = async (client, clientId) => {
    const { isNewClient } = this.props;

    this.setState({ error: null, loading: true });

    try {
      await this.props.client.mutate({
        mutation: isNewClient ? createClientQuery : updateClientQuery,
        variables: {
          clientId,
          client,
        },
      });

      this.setState({ error: null, loading: false });

      if (isNewClient) {
        this.props.history.push(
          `/auth/clients/${encodeURIComponent(clientId)}`
        );
      }
    } catch (error) {
      this.setState({ error, loading: false });
    }
  };

  handleDeleteClient = async clientId => {
    this.setState({ error: null, loading: true });

    try {
      await this.props.client.mutate({
        mutation: deleteClientQuery,
        variables: { clientId },
      });

      this.setState({ error: null, loading: false });

      this.props.history.push(`/auth/clients`);
    } catch (error) {
      this.setState({ error, loading: false });
    }
  };

  handleDisableClient = async clientId => {
    this.setState({ error: null, loading: true });

    try {
      await this.props.client.mutate({
        mutation: disableClientQuery,
        variables: { clientId },
        refetchQueries: ['Client'],
      });

      this.setState({ error: null, loading: false });
    } catch (error) {
      this.setState({ error, loading: false });
    }
  };

  handleEnableClient = async clientId => {
    this.setState({ error: null, loading: true });

    try {
      await this.props.client.mutate({
        mutation: enableClientQuery,
        variables: { clientId },
        refetchQueries: ['Client'],
      });

      this.setState({ error: null, loading: false });
    } catch (error) {
      this.setState({ error, loading: false });
    }
  };

  // TODO: Add action logic
  handleResetAccessToken = () => {};

  render() {
    const { error, loading } = this.state;
    const { isNewClient, data } = this.props;

    return (
      <Dashboard title={isNewClient ? 'Create Client' : 'Client'}>
        <Fragment>
          {error && <ErrorPanel error={error} />}
          {isNewClient ? (
            <ClientForm
              loading={loading}
              isNewClient
              onSaveClient={this.handleSaveClient}
            />
          ) : (
            <Fragment>
              {data.loading && <Spinner loading />}
              {data &&
                data.error &&
                data.error.graphQLErrors && (
                  <ErrorPanel error={data.error.graphQLErrors[0].message} />
                )}
              {data &&
                data.client && (
                  <ClientForm
                    loading={loading}
                    client={data.client}
                    onSaveClient={this.handleSaveClient}
                    onDeleteClient={this.handleDeleteClient}
                    onDisableClient={this.handleDisableClient}
                    onEnableClient={this.handleEnableClient}
                  />
                )}
            </Fragment>
          )}
        </Fragment>
      </Dashboard>
    );
  }
}
