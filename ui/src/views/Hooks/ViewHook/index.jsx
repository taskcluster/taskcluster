import { hot } from 'react-hot-loader';
import React, { Component, Fragment } from 'react';
import { graphql, withApollo } from 'react-apollo';
import Spinner from '@mozilla-frontend-infra/components/Spinner';
import Dashboard from '../../../components/Dashboard';
import HookForm from '../../../components/HookForm';
import ErrorPanel from '../../../components/ErrorPanel';
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
    dialogOpen: false,
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

    try {
      await this.props.client.mutate({
        mutation: deleteHookQuery,
        variables: {
          hookId,
          hookGroupId,
        },
      });

      this.setState({ error: null, actionLoading: false });
      this.props.history.push('/hooks');
    } catch (error) {
      this.setState({ error, actionLoading: false });
    }
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
    } catch (error) {
      this.setState({ error, actionLoading: false });
    }
  };

  handleActionDialogClose = () => {
    this.setState({
      actionLoading: false,
      dialogOpen: false,
      dialogError: null,
      error: null,
    });
  };

  handleDialogOpen = () => {
    this.setState({ dialogOpen: true });
  };

  handleDialogActionError = error => {
    this.setState({ dialogError: error, actionLoading: false });
  };

  render() {
    const { isNewHook, data } = this.props;
    const { error: err, dialogError, actionLoading, dialogOpen } = this.state;
    const error = (data && data.error) || err;

    return (
      <Dashboard title={isNewHook ? 'Create Hook' : 'Hook'}>
        <ErrorPanel error={error} />
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
                dialogOpen={dialogOpen}
                onTriggerHook={this.handleTriggerHook}
                onUpdateHook={this.handleUpdateHook}
                onDeleteHook={this.handleDeleteHook}
                onActionDialogClose={this.handleActionDialogClose}
                onDialogActionError={this.handleDialogActionError}
                onDialogOpen={this.handleDialogOpen}
              />
            )}
          </Fragment>
        )}
      </Dashboard>
    );
  }
}
