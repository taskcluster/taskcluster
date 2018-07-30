import { hot } from 'react-hot-loader';
import { Component, Fragment } from 'react';
import { graphql } from 'react-apollo';
import ErrorPanel from '@mozilla-frontend-infra/components/ErrorPanel';
import Spinner from '@mozilla-frontend-infra/components/Spinner';
import Dashboard from '../../../components/Dashboard';
import HookForm from '../../../components/HookForm';
import hookQuery from './hook.graphql';

@hot(module)
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
  render() {
    const { isNewHook, user, onSignIn, onSignOut, data } = this.props;

    return (
      <Dashboard
        title={isNewHook ? 'Create Hook' : 'Hook'}
        user={user}
        onSignIn={onSignIn}
        onSignOut={onSignOut}>
        {isNewHook ? (
          <HookForm isNewHook />
        ) : (
          <Fragment>
            {!data.hook && data.loading && <Spinner loading />}
            {data.error &&
              data.error.graphQLErrors && <ErrorPanel error={data.error} />}
            {data.hook && <HookForm hook={data.hook} />}
          </Fragment>
        )}
      </Dashboard>
    );
  }
}
