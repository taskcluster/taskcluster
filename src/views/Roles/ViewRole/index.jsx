import { hot } from 'react-hot-loader';
import { Component, Fragment } from 'react';
import { graphql } from 'react-apollo';
import ErrorPanel from '@mozilla-frontend-infra/components/ErrorPanel';
import Spinner from '@mozilla-frontend-infra/components/Spinner';
import Dashboard from '../../../components/Dashboard';
import RoleForm from '../../../components/RoleForm';
import roleQuery from './role.graphql';

@hot(module)
@graphql(roleQuery, {
  skip: ({ match: { params } }) => !params.roleId,
  options: ({ match: { params } }) => ({
    variables: {
      roleId: decodeURIComponent(params.roleId),
    },
  }),
})
export default class ViewRole extends Component {
  render() {
    const { isNewRole, data } = this.props;

    return (
      <Dashboard title={isNewRole ? 'Create Role' : 'Role'}>
        {isNewRole ? (
          <RoleForm isNewRole />
        ) : (
          <Fragment>
            {data.loading && <Spinner loading />}
            {data &&
              data.error &&
              data.error.graphQLErrors && (
                <ErrorPanel error={data.error.graphQLErrors[0].message} />
              )}
            {data && data.role && <RoleForm role={data.role} />}
          </Fragment>
        )}
      </Dashboard>
    );
  }
}
