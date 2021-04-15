import { hot } from 'react-hot-loader';
import React, { Component, Fragment } from 'react';
import { graphql, withApollo } from 'react-apollo';
import Spinner from '../../../components/Spinner';
import Dashboard from '../../../components/Dashboard';
import HookForm from '../../../components/HookForm';
import ErrorPanel from '../../../components/ErrorPanel';
import Snackbar from '../../../components/Snackbar';
import hookQuery from './hook.graphql';
import createHookQuery from './createHook.graphql';
import deleteHookQuery from './deleteHook.graphql';
import updateHookQuery from './updateHook.graphql';
import triggerHookQuery from './triggerHook.graphql';

@hot(module)
@withApollo
@graphql(hookQuery, {
  skip: ({ match: { params } }) => !params.hookId,
  options: ({ match: { params } }) => ({
    fetchPolicy: 'network-only',
    variables: {
      hookGroupId: params.hookGroupId,
      hookId: decodeURIComponent(params.hookId),
    },
  }),
})
export default class ViewHook extends Component {
  state = {
    actionLoading: false,
    error: null,
    dialogError: null,
    deleteDialogOpen: false,
    dialogOpen: false,
    snackbar: {
      message: '',
      variant: 'success',
      open: false,
    },
  };

  preRunningAction = () => {
    this.setState({ dialogError: null, actionLoading: true });
  };

  handleCreateHook = async ({ hookId, hookGroupId, payload }) => {
    this.preRunningAction();

    try {
      await this.props.client.mutate({
        mutation: createHookQuery,
        variables: {
          hookId,
          hookGroupId,
          payload,
        },
        refetchQueries: ['Hook'],
        awaitRefetchQueries: true,
      });

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

    return this.props.client.mutate({
      mutation: deleteHookQuery,
      variables: {
        hookId,
        hookGroupId,
      },
    });
  };

  handleTriggerHook = async ({ hookGroupId, hookId, payload }) => {
    this.preRunningAction();

    await this.props.client.mutate({
      mutation: triggerHookQuery,
      variables: {
        hookId,
        hookGroupId,
        payload,
      },
      refetchQueries: ['Hook'],
      awaitRefetchQueries: true,
    });
    this.handleSnackbarOpen({ message: 'Hook Triggered', open: true });
  };

  handleUpdateHook = async ({ hookGroupId, hookId, payload }) => {
    this.preRunningAction();

    try {
      await this.props.client.mutate({
        mutation: updateHookQuery,
        variables: {
          hookId,
          hookGroupId,
          payload,
        },
        refetchQueries: ['Hook'],
        awaitRefetchQueries: true,
      });

      this.setState({ error: null, actionLoading: false });
      this.handleSnackbarOpen({ message: 'Hook Updated', open: true });
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

  handleSnackbarClose = (event, reason) => {
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
    const { isNewHook, data } = this.props;
    const {
      error: err,
      dialogError,
      actionLoading,
      deleteDialogOpen,
      dialogOpen,
      snackbar,
    } = this.state;
    const error = (data && data.error) || err;
    const hookLastFires =
      data &&
      data.hookLastFires &&
      data.hookLastFires.sort(
        (a, b) => new Date(b.taskCreateTime) - new Date(a.taskCreateTime)
      );

    return (
      <Dashboard title={isNewHook ? 'Create Hook' : 'Hook'}>
        <ErrorPanel fixed error={error} />
        {isNewHook ? (
          <Fragment>
            <HookForm
              isNewHook
              dialogError={dialogError}
              actionLoading={actionLoading}
              onCreateHook={this.handleCreateHook}
            />
          </Fragment>
        ) : (
          <Fragment>
            {!data.hook && data.loading && <Spinner loading />}
            {data.hook && (
              <HookForm
                dialogError={dialogError}
                actionLoading={actionLoading}
                hook={data.hook}
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
              />
            )}
          </Fragment>
        )}
        <Snackbar onClose={this.handleSnackbarClose} {...snackbar} />
      </Dashboard>
    );
  }
}
