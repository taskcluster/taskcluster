import React, { Component, Fragment } from 'react';
import { Secrets } from '@taskcluster/client-web';
import Spinner from '../../../components/Spinner';
import Dashboard from '../../../components/Dashboard';
import SecretForm from '../../../components/SecretForm';
import HelpView from '../../../components/HelpView';
import ErrorPanel from '../../../components/ErrorPanel';
import Snackbar from '../../../components/Snackbar';
import { withTaskclusterClient } from '../../../utils/TaskclusterClient';

@withTaskclusterClient
export default class ViewSecret extends Component {
  state = {
    loading: false,
    secret: null,
    error: null,
    dialogError: null,
    dialogOpen: false,
    snackbar: {
      message: '',
      variant: 'success',
      open: false,
    },
  };

  get secretsClient() {
    return this.props.createTaskclusterClient({ Class: Secrets });
  }

  componentDidMount() {
    if (!this.props.isNewSecret) {
      this.fetchSecret();
    }
  }

  fetchSecret = async () => {
    const name = decodeURIComponent(this.props.match.params.secret);

    this.setState({ loading: true, error: null, secret: null });

    try {
      const secret = await this.secretsClient.get(name);

      this.setState({
        loading: false,
        secret: {
          name,
          ...secret,
        },
      });
    } catch (error) {
      this.setState({ loading: false, error });
    }
  };

  handleDeleteSecret = name => {
    this.setState({ dialogError: null, loading: true });

    return this.secretsClient.remove(name);
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
      await this.secretsClient.set(name, secret);

      this.setState({
        error: null,
        loading: false,
        secret: {
          name,
          ...secret,
        },
      });

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

  handleSnackbarClose = (_event, reason) => {
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
    const { loading, secret, error, snackbar, dialogError, dialogOpen } =
      this.state;
    const { description, isNewSecret } = this.props;

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
            {loading && !secret && <Spinner loading />}
            {secret && (
              <SecretForm
                loading={loading}
                secret={secret}
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
