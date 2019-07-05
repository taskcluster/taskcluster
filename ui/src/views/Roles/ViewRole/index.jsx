import { hot } from 'react-hot-loader';
import React, { Component, Fragment } from 'react';
import { graphql, withApollo } from 'react-apollo';
import Spinner from '@mozilla-frontend-infra/components/Spinner';
import Snackbar from '../../../components/Snackbar';
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
    fetchPolicy: 'network-only',
    variables: {
      roleId: decodeURIComponent(params.roleId),
    },
  }),
})
export default class ViewRole extends Component {
  state = {
    loading: false,
    error: null,
    dialogError: null,
    dialogOpen: false,
    snackbar: {
      message: '',
      variant: 'success',
      open: false,
    },
  };

  preRunningAction = () => {
    this.setState({ dialogError: null });
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

        return;
      }

      this.handleSnackbarOpen({ message: 'Role Saved', open: true });
    } catch (error) {
      this.setState({ error, loading: false });
    }
  };

  handleActionDialogClose = () => {
    this.setState({
      dialogOpen: false,
      dialogError: null,
      error: null,
    });
  };

  handleDialogOpen = () => {
    this.setState({ dialogOpen: true });
  };

  handleDialogActionError = error => {
    this.setState({ dialogError: error });
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

  render() {
    const { loading, error, snackbar, dialogError, dialogOpen } = this.state;
    const { isNewRole, data } = this.props;

    return (
      <Dashboard title={isNewRole ? 'Create Role' : 'Role'}>
        <Fragment>
          <ErrorPanel fixed error={error} />
          {isNewRole ? (
            <RoleForm
              isNewRole
              loading={loading}
              dialogError={dialogError}
              onRoleSave={this.handleSaveRole}
            />
          ) : (
            <Fragment>
              {data.loading && <Spinner loading />}
              {data && <ErrorPanel fixed error={data.error} />}
              {data && data.role && (
                <RoleForm
                  dialogError={dialogError}
                  role={data.role}
                  loading={loading}
                  onRoleDelete={this.handleDeleteRole}
                  onRoleSave={this.handleSaveRole}
                  dialogOpen={dialogOpen}
                  onActionDialogClose={this.handleActionDialogClose}
                  onDialogActionError={this.handleDialogActionError}
                  onDialogOpen={this.handleDialogOpen}
                />
              )}
            </Fragment>
          )}
        </Fragment>
        <Snackbar onClose={this.handleSnackbarClose} {...snackbar} />
      </Dashboard>
    );
  }
}
