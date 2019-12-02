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
    dialogError: null,
    dialogOpen: false,
    snackbar: {
      message: '',
      variant: 'success',
      open: false,
    },
  };

  handleDeleteSecret = name => {
    this.setState({ dialogError: null, loading: true });

    return this.props.client.mutate({
      mutation: deleteSecretQuery,
      variables: { name },
    });
  };

  handleDialogActionError = error => {
    this.setState({ dialogError: error, loading: false });
  };

  handleDialogActionComplete = () => {
    this.props.history.push(`/secrets`);
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
        refetchQueries: ['Secret'],
        awaitRefetchQueries: true,
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

  handleDialogActionClose = () => {
    this.setState({
      dialogOpen: false,
      dialogError: null,
      error: null,
    });
  };

  handleDialogActionOpen = () => {
    this.setState({ dialogOpen: true });
  };

  render() {
    const { loading, error, snackbar, dialogError, dialogOpen } = this.state;
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
                dialogError={dialogError}
                dialogOpen={dialogOpen}
                onDialogActionError={this.handleDialogActionError}
                onDialogActionComplete={this.handleDialogActionComplete}
                onDialogActionClose={this.handleDialogActionClose}
                onDialogActionOpen={this.handleDialogActionOpen}
              />
            )}
          </Fragment>
        )}
        <Snackbar onClose={this.handleSnackbarClose} {...snackbar} />
      </Dashboard>
    );
  }
}
