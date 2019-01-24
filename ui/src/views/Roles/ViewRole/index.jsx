import { hot } from 'react-hot-loader';
import React, { Component, Fragment } from 'react';
import { graphql, withApollo } from 'react-apollo';
import Spinner from '@mozilla-frontend-infra/components/Spinner';
import Dashboard from '../../../components/Dashboard';
import RoleForm from '../../../components/RoleForm';
import ErrorPanel from '../../../components/ErrorPanel';
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

  render() {
    const { loading, error } = this.state;
    const { isNewRole, data } = this.props;

    return (
      <Dashboard title={isNewRole ? 'Create Role' : 'Role'}>
        <Fragment>
          <ErrorPanel error={error} />
          {isNewRole ? (
            <RoleForm
              isNewRole
              loading={loading}
              onSaveRole={this.handleSaveRole}
            />
          ) : (
            <Fragment>
              {data.loading && <Spinner loading />}
              {data && <ErrorPanel error={data.error} />}
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
