import { hot } from 'react-hot-loader';
import { Component, Fragment } from 'react';
import { graphql, withApollo } from 'react-apollo';
import ErrorPanel from '@mozilla-frontend-infra/components/ErrorPanel';
import Spinner from '@mozilla-frontend-infra/components/Spinner';
import Dashboard from '../../../components/Dashboard';
import RoleForm from '../../../components/RoleForm';
import roleQuery from './role.graphql';
import createRoleQuery from './createRole.graphql';
import updateRoleQuery from './updateRole.graphql';
import deleteRoleQuery from './deleteRole.graphql';

@hot(module)
@withApollo
@graphql(roleQuery, {
  skip: ({ match: { params } }) => !params.roleId,
  options: ({ match: { params } }) => ({
    variables: {
      roleId: decodeURIComponent(params.roleId),
    },
  }),
})
export default class ViewRole extends Component {
  state = {
    loading: false,
    error: null,
  };

  handleSaveRole = async (role, roleId) => {
    const { isNewRole } = this.props;

    this.setState({ error: null, loading: true });

    try {
      await this.props.client.mutate({
        mutation: isNewRole ? createRoleQuery : updateRoleQuery,
        variables: {
          roleId,
          role,
        },
      });

      this.setState({ error: null, loading: false });

      if (isNewRole) {
        this.props.history.push(`/auth/roles/${encodeURIComponent(roleId)}`);
      }
    } catch (error) {
      this.setState({ error, loading: false });
    }
  };

  handleDeleteRole = async roleId => {
    this.setState({ error: null, loading: true });

    try {
      await this.props.client.mutate({
        mutation: deleteRoleQuery,
        variables: { roleId },
      });

      this.setState({ error: null, loading: false });

      this.props.history.push(`/auth/roles`);
    } catch (error) {
      this.setState({ error, loading: false });
    }
  };

  render() {
    const { loading, error } = this.state;
    const { isNewRole, data } = this.props;

    return (
      <Dashboard title={isNewRole ? 'Create Role' : 'Role'}>
        <Fragment>
          {error && <ErrorPanel error={error} />}
          {isNewRole ? (
            <RoleForm
              isNewRole
              loading={loading}
              onSaveRole={this.handleSaveRole}
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
                data.role && (
                  <RoleForm
                    role={data.role}
                    loading={loading}
                    onDeleteRole={this.handleDeleteRole}
                    onSaveRole={this.handleSaveRole}
                  />
                )}
            </Fragment>
          )}
        </Fragment>
      </Dashboard>
    );
  }
}
