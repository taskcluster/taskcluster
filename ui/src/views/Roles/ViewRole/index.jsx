import React, { Component, Fragment } from 'react';
import { graphql, withApollo } from 'react-apollo';
import Spinner from '../../../components/Spinner';
import Snackbar from '../../../components/Snackbar';
import Dashboard from '../../../components/Dashboard';
import RoleForm from '../../../components/RoleForm';
import ErrorPanel from '../../../components/ErrorPanel';
import roleQuery from './role.graphql';
import createRoleQuery from './createRole.graphql';
import updateRoleQuery from './updateRole.graphql';
import deleteRoleQuery from './deleteRole.graphql';

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

  handleDeleteRole = async roleId => {
    this.setState({ dialogError: null, loading: true });

    await this.props.client.mutate({
      mutation: deleteRoleQuery,
      variables: { roleId },
    });

    this.props.history.push(`/auth/roles`);
  };

  handleDialogActionError = error => {
    this.setState({ dialogError: error, loading: false });
  };

  handleDialogActionComplete = () => {
    this.setState({ dialogError: null, loading: false });
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
              onRoleSave={this.handleSaveRole}
            />
          ) : (
            <Fragment>
              {data.loading && <Spinner loading />}
              {data && <ErrorPanel fixed error={data.error} />}
              {data && data.role && (
                <RoleForm
                  dialogError={dialogError}
                  key={data.role.roleId}
                  role={data.role}
                  loading={loading}
                  onRoleDelete={this.handleDeleteRole}
                  onRoleSave={this.handleSaveRole}
                  dialogOpen={dialogOpen}
                  onDialogActionError={this.handleDialogActionError}
                  onDialogActionComplete={this.handleDialogActionComplete}
                  onDialogActionClose={this.handleDialogActionClose}
                  onDialogActionOpen={this.handleDialogActionOpen}
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
