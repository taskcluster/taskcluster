import React, { Component, Fragment } from 'react';
import { Auth } from '@taskcluster/client-web';
import Spinner from '../../../components/Spinner';
import Snackbar from '../../../components/Snackbar';
import Dashboard from '../../../components/Dashboard';
import RoleForm from '../../../components/RoleForm';
import ErrorPanel from '../../../components/ErrorPanel';
import { withTaskclusterClient } from '../../../utils/TaskclusterClient';

@withTaskclusterClient
export default class ViewRole extends Component {
  state = {
    loading: false,
    role: null,
    error: null,
    dialogError: null,
    dialogOpen: false,
    snackbar: {
      message: '',
      variant: 'success',
      open: false,
    },
  };

  get authClient() {
    return this.props.createTaskclusterClient({ Class: Auth });
  }

  componentDidMount() {
    if (!this.props.isNewRole) {
      this.fetchRole();
    }
  }

  fetchRole = async () => {
    const roleId = decodeURIComponent(this.props.match.params.roleId);

    this.setState({ loading: true, error: null, role: null });

    try {
      const role = await this.authClient.role(roleId);

      this.setState({ loading: false, role });
    } catch (error) {
      this.setState({ loading: false, error });
    }
  };

  handleDeleteRole = roleId => {
    this.setState({ dialogError: null, loading: true });

    return this.authClient.deleteRole(roleId);
  };

  handleDialogActionError = error => {
    this.setState({ dialogError: error, loading: false });
  };

  handleDialogActionComplete = () => {
    this.props.history.push('/auth/roles');
  };

  handleSaveRole = async (role, roleId) => {
    const { isNewRole } = this.props;

    this.setState({ error: null, loading: true });

    try {
      if (isNewRole) {
        await this.authClient.createRole(roleId, role);
      } else {
        await this.authClient.updateRole(roleId, role);
      }

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

  handleSnackbarClose = (_event, reason) => {
    if (reason === 'clickaway') {
      return;
    }

    this.setState({
      snackbar: { message: '', variant: 'success', open: false },
    });
  };

  render() {
    const { loading, role, error, snackbar, dialogError, dialogOpen } =
      this.state;
    const { isNewRole } = this.props;

    return (
      <Dashboard title={isNewRole ? 'Create Role' : 'Role'}>
        <ErrorPanel fixed error={error} />
        {isNewRole ? (
          <RoleForm
            isNewRole
            loading={loading}
            onRoleSave={this.handleSaveRole}
          />
        ) : (
          <Fragment>
            {loading && !role && <Spinner loading />}
            {role && (
              <RoleForm
                dialogError={dialogError}
                key={role.roleId}
                role={role}
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
        <Snackbar onClose={this.handleSnackbarClose} {...snackbar} />
      </Dashboard>
    );
  }
}
