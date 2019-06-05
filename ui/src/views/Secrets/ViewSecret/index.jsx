import { hot } from 'react-hot-loader';
import React, { Component, Fragment } from 'react';
import { graphql, withApollo } from 'react-apollo';
import Spinner from '@mozilla-frontend-infra/components/Spinner';
import Dashboard from '../../../components/Dashboard';
import SecretForm from '../../../components/SecretForm';
import HelpView from '../../../components/HelpView';
import ErrorPanel from '../../../components/ErrorPanel';
import Snackbar from '../../../components/Snackbar';
import secretQuery from './secret.graphql';
import createSecretQuery from './createSecret.graphql';
import updateSecretQuery from './updateSecret.graphql';
import deleteSecretQuery from './deleteSecret.graphql';

@hot(module)
@withApollo
@graphql(secretQuery, {
  skip: ({ match: { params } }) => !params.secret,
  options: ({ match: { params } }) => ({
    fetchPolicy: 'network-only',
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
    snackbar: {
      message: '',
      variant: 'success',
      open: false,
    },
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

      this.handleSnackbarOpen({ message: 'Secret Saved', open: true });
    } catch (error) {
      this.setState({ error, loading: false });
    }
  };

  handleSnackbarOpen = ({ message, variant = 'success', open }) => {
    this.setState({ snackbar: { message, variant, open } });
  };

  handleSnackbarClose = (event, reason) => {
    if (reason === 'clickaway') {
      return;
    }

    this.setState({
      snackbar: { message: '', variant: 'success', open: false },
    });
  };

  render() {
    const { loading, error, snackbar } = this.state;
    const { description, isNewSecret, data } = this.props;

    return (
      <Dashboard
        title="Secrets"
        helpView={<HelpView description={description} />}>
        <ErrorPanel fixed error={error} />
        {isNewSecret ? (
          <SecretForm
            loading={loading}
            isNewSecret
            onSaveSecret={this.handleSaveSecret}
          />
        ) : (
          <Fragment>
            {data.loading && <Spinner loading />}
            {data && <ErrorPanel fixed error={data.error} />}
            {data && data.secret && (
              <SecretForm
                loading={loading}
                secret={data.secret}
                onSaveSecret={this.handleSaveSecret}
                onDeleteSecret={this.handleDeleteSecret}
              />
            )}
          </Fragment>
        )}
        <Snackbar onClose={this.handleSnackbarClose} {...snackbar} />
      </Dashboard>
    );
  }
}
