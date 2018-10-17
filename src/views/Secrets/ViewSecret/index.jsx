import { hot } from 'react-hot-loader';
import React, { Component, Fragment } from 'react';
import { graphql, withApollo } from 'react-apollo';
import ErrorPanel from '@mozilla-frontend-infra/components/ErrorPanel';
import Spinner from '@mozilla-frontend-infra/components/Spinner';
import Typography from '@material-ui/core/Typography';
import Dashboard from '../../../components/Dashboard';
import SecretForm from '../../../components/SecretForm';
import HelpView from '../../../components/HelpView';
import formatError from '../../../utils/formatError';
import secretQuery from './secret.graphql';
import createSecretQuery from './createSecret.graphql';
import updateSecretQuery from './updateSecret.graphql';
import deleteSecretQuery from './deleteSecret.graphql';

@hot(module)
@withApollo
@graphql(secretQuery, {
  skip: ({ match: { params } }) => !params.secret,
  options: ({ match: { params } }) => ({
    variables: {
      name: decodeURIComponent(params.secret),
    },
  }),
})
export default class ViewSecret extends Component {
  state = {
    loading: false,
    // Mutation errors
    error: null,
  };

  handleDeleteSecret = async name => {
    this.setState({ error: null, loading: true });

    try {
      await this.props.client.mutate({
        mutation: deleteSecretQuery,
        variables: { name },
      });

      this.setState({ error: null, loading: false });

      this.props.history.push(`/secrets`);
    } catch (error) {
      this.setState({ error, loading: false });
    }
  };

  handleSaveSecret = async (name, secret) => {
    const { isNewSecret } = this.props;

    this.setState({ error: null, loading: true });

    try {
      await this.props.client.mutate({
        mutation: isNewSecret ? createSecretQuery : updateSecretQuery,
        variables: {
          name,
          secret,
        },
      });

      this.setState({ error: null, loading: false });

      if (isNewSecret) {
        this.props.history.push(`/secrets/${encodeURIComponent(name)}`);
      }
    } catch (error) {
      this.setState({ error, loading: false });
    }
  };

  render() {
    const { loading, error } = this.state;
    const { description, isNewSecret, data } = this.props;

    return (
      <Dashboard
        title="Secrets"
        helpView={
          <HelpView description={description}>
            <Typography>
              Secrets starting with <code>garbage/</code> are visible to just
              about everybody. Use them to experiment, but not for real secrets!
            </Typography>
          </HelpView>
        }
      >
        {error && <ErrorPanel error={formatError(error)} />}
        {isNewSecret ? (
          <SecretForm
            loading={loading}
            isNewSecret
            onSaveSecret={this.handleSaveSecret}
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
              data.secret && (
                <SecretForm
                  loading={loading}
                  secret={data.secret}
                  onSaveSecret={this.handleSaveSecret}
                  onDeleteSecret={this.handleDeleteSecret}
                />
              )}
          </Fragment>
        )}
      </Dashboard>
    );
  }
}
