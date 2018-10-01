import { hot } from 'react-hot-loader';
import { Component, Fragment } from 'react';
import { graphql, withApollo } from 'react-apollo';
import ErrorPanel from '@mozilla-frontend-infra/components/ErrorPanel';
import Spinner from '@mozilla-frontend-infra/components/Spinner';
import Dashboard from '../../../components/Dashboard';
import HookForm from '../../../components/HookForm';
import hookQuery from './hook.graphql';
import createHookQuery from './createHook.graphql';
import deleteHookQuery from './deleteHook.graphql';
import updateHookQuery from './updateHook.graphql';

@hot(module)
@withApollo
@graphql(hookQuery, {
  skip: ({ match: { params } }) => !params.hookId,
  options: ({ match: { params } }) => ({
    variables: {
      hookGroupId: params.hookGroupId,
      hookId: params.hookId,
    },
  }),
})
export default class ViewHook extends Component {
  state = {
    actionLoading: false,
    error: null,
  };

  handleCreateHook = async ({ hookId, hookGroupId, payload }) => {
    this.setState({ error: null, actionLoading: true });

    try {
      await this.props.client.mutate({
        mutation: createHookQuery,
        variables: {
          hookId,
          hookGroupId,
          payload,
        },
      });

      this.setState({ error: null, actionLoading: false });
      this.props.history.push(
        `/hooks/${encodeURIComponent(hookGroupId)}/${hookId}`
      );
    } catch (error) {
      this.setState({ error, actionLoading: false });
    }
  };

  handleDeleteHook = async ({ hookId, hookGroupId }) => {
    this.setState({ error: null, actionLoading: true });

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

  handleUpdateHook = async ({ hookGroupId, hookId, payload }) => {
    this.setState({ error: null, actionLoading: true });

    try {
      await this.props.client.mutate({
        mutation: updateHookQuery,
        variables: {
          hookId,
          hookGroupId,
          payload,
        },
      });

      this.setState({ error: null, actionLoading: false });
    } catch (error) {
      this.setState({ error, actionLoading: false });
    }
  };

  // TODO: Attach action
  handleTriggerHook = () => {};

  render() {
    const { isNewHook, data } = this.props;
    const { error, actionLoading } = this.state;

    return (
      <Dashboard title={isNewHook ? 'Create Hook' : 'Hook'}>
        {isNewHook ? (
          <Fragment>
            {error && <ErrorPanel error={error} />}
            <HookForm isNewHook onCreateHook={this.handleCreateHook} />
          </Fragment>
        ) : (
          <Fragment>
            {!data.hook && data.loading && <Spinner loading />}
            {error && <ErrorPanel error={error} />}
            {data.error &&
              data.error.graphQLErrors && <ErrorPanel error={data.error} />}
            {data.hook && (
              <HookForm
                hook={data.hook}
                onTriggerHook={this.handleTriggerHook}
                onUpdateHook={this.handleUpdateHook}
                onDeleteHook={this.handleDeleteHook}
                actionLoading={actionLoading}
              />
            )}
          </Fragment>
        )}
      </Dashboard>
    );
  }
}
