import React, { Component, Fragment } from 'react';
import { Hooks } from '@taskcluster/client-web';
import { Typography } from '@material-ui/core';
import Spinner from '../../../components/Spinner';
import Dashboard from '../../../components/Dashboard';
import HookForm from '../../../components/HookForm';
import ErrorPanel from '../../../components/ErrorPanel';
import Snackbar from '../../../components/Snackbar';
import exchangesList from '../../../utils/exchangesList';
import Breadcrumbs from '../../../components/Breadcrumbs';
import Link from '../../../utils/Link';
import { withTaskclusterClient } from '../../../utils/TaskclusterClient';
import { VIEW_CLIENTS_PAGE_SIZE } from '../../../utils/constants';

@withTaskclusterClient
export default class ViewHook extends Component {
  state = {
    loading: false,
    actionLoading: false,
    hook: null,
    hookLastFires: null,
    error: null,
    dialogError: null,
    deleteDialogOpen: false,
    dialogOpen: false,
    snackbar: {
      message: '',
      variant: 'success',
      open: false,
    },
    exchangesDictionary: null,
  };

  get hooksClient() {
    return this.props.createTaskclusterClient({ Class: Hooks });
  }

  async componentDidMount() {
    this.setState({ exchangesDictionary: await exchangesList() });

    if (!this.props.isNewHook) {
      await this.fetchHook();
    }
  }

  fetchHook = async () => {
    const { hookGroupId, hookId } = this.props.match.params;
    const decodedHookId = decodeURIComponent(hookId);

    this.setState({ loading: true, error: null });

    try {
      const [hook, lastFiresResult] = await Promise.all([
        this.hooksClient.hook(hookGroupId, decodedHookId),
        // listLastFires returns 404 when the hook has never fired
        this.hooksClient
          .listLastFires(hookGroupId, decodedHookId, {
            limit: VIEW_CLIENTS_PAGE_SIZE,
          })
          .catch(err => {
            if (err.response?.status === 404) {
              return { lastFires: [] };
            }

            throw err;
          }),
      ]);

      const hookLastFires = (lastFiresResult.lastFires || []).sort(
        (a, b) => new Date(b.taskCreateTime) - new Date(a.taskCreateTime)
      );

      this.setState({
        loading: false,
        hook,
        hookLastFires,
      });
    } catch (error) {
      this.setState({ loading: false, error });
    }
  };

  preRunningAction = () => {
    this.setState({ dialogError: null, actionLoading: true });
  };

  handleCreateHook = async ({ hookId, hookGroupId, payload }) => {
    this.preRunningAction();

    try {
      await this.hooksClient.createHook(hookGroupId, hookId, payload);

      this.props.history.push(
        `/hooks/${encodeURIComponent(hookGroupId)}/${hookId}`
      );

      this.setState({ error: null, actionLoading: false });
    } catch (error) {
      this.setState({ error, actionLoading: false });
    }
  };

  handleDeleteHook = async ({ hookId, hookGroupId }) => {
    this.preRunningAction();

    return this.hooksClient.removeHook(hookGroupId, hookId);
  };

  handleTriggerHook = async ({ hookGroupId, hookId, payload }) => {
    this.preRunningAction();

    try {
      await this.hooksClient.triggerHook(hookGroupId, hookId, payload);

      this.setState({ actionLoading: false });
      this.handleSnackbarOpen({ message: 'Hook Triggered', open: true });
      await this.fetchHook();
    } catch (error) {
      this.setState({ dialogError: error, actionLoading: false });
      throw error;
    }
  };

  handleUpdateHook = async ({ hookGroupId, hookId, payload }) => {
    this.preRunningAction();

    try {
      await this.hooksClient.updateHook(hookGroupId, hookId, payload);

      this.setState({ error: null, actionLoading: false });
      this.handleSnackbarOpen({ message: 'Hook Updated', open: true });
      await this.fetchHook();
    } catch (error) {
      this.setState({ error, actionLoading: false });
    }
  };

  handleActionDialogClose = () => {
    this.setState({
      actionLoading: false,
      dialogOpen: false,
      deleteDialogOpen: false,
      dialogError: null,
      error: null,
    });
  };

  handleDialogOpen = () => {
    this.setState({ dialogOpen: true });
  };

  handleDeleteDialogHook = () => {
    this.setState({ deleteDialogOpen: true });
  };

  handleDialogActionError = error => {
    this.setState({ dialogError: error, actionLoading: false });
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

  handleActionDialogDeleteComplete = () => {
    this.props.history.push('/hooks');
  };

  render() {
    const { isNewHook, match } = this.props;
    const {
      loading,
      hook,
      hookLastFires,
      error,
      dialogError,
      actionLoading,
      deleteDialogOpen,
      dialogOpen,
      snackbar,
      exchangesDictionary,
    } = this.state;

    return (
      <Dashboard title={isNewHook ? 'Create Hook' : 'Hook'}>
        <Breadcrumbs>
          <Link to="/hooks">
            <Typography variant="body2">Hooks</Typography>
          </Link>
          <Link to={`/hooks/${match.params?.hookGroupId}`}>
            <Typography variant="body2">{match.params?.hookGroupId}</Typography>
          </Link>
          <Typography variant="body2" color="textSecondary">
            {match.params?.hookId}
          </Typography>
        </Breadcrumbs>
        <ErrorPanel fixed error={error} />
        {isNewHook ? (
          <HookForm
            isNewHook
            dialogError={dialogError}
            actionLoading={actionLoading}
            onCreateHook={this.handleCreateHook}
            exchangesDictionary={exchangesDictionary}
          />
        ) : (
          <Fragment>
            {!hook && loading && <Spinner loading />}
            {hook && (
              <HookForm
                dialogError={dialogError}
                actionLoading={actionLoading}
                hook={hook}
                hookLastFires={hookLastFires}
                dialogOpen={dialogOpen}
                deleteDialogOpen={deleteDialogOpen}
                onTriggerHook={this.handleTriggerHook}
                onUpdateHook={this.handleUpdateHook}
                onDeleteHook={this.handleDeleteHook}
                onDialogActionDeleteComplete={
                  this.handleActionDialogDeleteComplete
                }
                onDialogActionClose={this.handleActionDialogClose}
                onDialogActionError={this.handleDialogActionError}
                onDialogOpen={this.handleDialogOpen}
                onDialogDeleteHook={this.handleDeleteDialogHook}
                exchangesDictionary={exchangesDictionary}
              />
            )}
          </Fragment>
        )}
        <Snackbar onClose={this.handleSnackbarClose} {...snackbar} />
      </Dashboard>
    );
  }
}
