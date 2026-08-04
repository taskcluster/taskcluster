import React, { Component } from 'react';
import { Auth } from '@taskcluster/client-web';
import { withStyles } from '@material-ui/core/styles';
import Typography from '@material-ui/core/Typography';
import PlusIcon from 'mdi-react/PlusIcon';
import qs from 'qs';
import Spinner from '../../../components/Spinner';
import Dashboard from '../../../components/Dashboard';
import Search from '../../../components/Search';
import RolesTable from '../../../components/RolesTable';
import HelpView from '../../../components/HelpView';
import Button from '../../../components/Button';
import ErrorPanel from '../../../components/ErrorPanel';
import DialogAction from '../../../components/DialogAction';
import withPaginatedResource from '../../../hocs/withPaginatedResource';
import { VIEW_ROLES_PAGE_SIZE } from '../../../utils/constants';
import { withTaskclusterClient } from '../../../utils/TaskclusterClient';

@withStyles(theme => ({
  plusIconSpan: {
    ...theme.mixins.fab,
  },
}))
@withTaskclusterClient
@withPaginatedResource({
  fetch: props => options =>
    props.createTaskclusterClient({ Class: Auth }).listRoleIds(options),
  payload: { limit: VIEW_ROLES_PAGE_SIZE },
  select: response => response.roleIds,
})
export default class ViewRoles extends Component {
  state = {
    dialogOpen: false,
    deleteRoleId: null,
    dialogError: null,
  };

  get searchTerm() {
    return qs.parse(this.props.location.search.slice(1)).search || null;
  }

  get authClient() {
    return this.props.createTaskclusterClient({ Class: Auth });
  }

  handleSearchSubmit = roleSearch => {
    const { history, location, reload } = this.props;

    if ((roleSearch || null) === this.searchTerm) {
      reload();
      return;
    }

    history.push({
      search: qs.stringify({
        ...qs.parse(location.search.slice(1)),
        search: roleSearch,
      }),
    });
  };

  handleCreate = () => {
    this.props.history.push('/auth/roles/create');
  };

  handleDeleteRole = () => this.authClient.deleteRole(this.state.deleteRoleId);

  handleDialogActionComplete = () => {
    this.setState({ dialogOpen: false, deleteRoleId: null });
    this.props.reload();
  };

  handleDialogActionClose = () => {
    this.setState({
      dialogOpen: false,
      deleteRoleId: null,
      dialogError: null,
    });
  };

  handleDialogActionError = error => {
    this.setState({ dialogError: error });
  };

  handleDialogActionOpen = roleId => {
    this.setState({ dialogOpen: true, deleteRoleId: roleId });
  };

  render() {
    const {
      classes,
      description,
      items,
      loading,
      error,
      page,
      hasNextPage,
      hasPreviousPage,
      nextPage,
      previousPage,
    } = this.props;
    const { dialogOpen, deleteRoleId, dialogError } = this.state;
    const { searchTerm } = this;
    const roleIds = searchTerm
      ? items.filter(id => id.toLowerCase().includes(searchTerm.toLowerCase()))
      : items;
    const initialLoad = loading && !items.length;

    return (
      <Dashboard
        title="Roles"
        helpView={<HelpView description={description} />}
        search={
          <Search
            disabled={loading}
            defaultValue={searchTerm}
            onSubmit={this.handleSearchSubmit}
            placeholder="Role contains"
          />
        }>
        {initialLoad && <Spinner loading />}
        <ErrorPanel fixed error={error} />
        {!initialLoad && (
          <RolesTable
            roleIds={roleIds}
            searchTerm={searchTerm}
            loading={loading}
            page={page}
            hasNextPage={hasNextPage}
            hasPreviousPage={hasPreviousPage}
            onNextPage={nextPage}
            onPreviousPage={previousPage}
            onDialogActionOpen={this.handleDialogActionOpen}
          />
        )}
        <Button
          spanProps={{ className: classes.plusIconSpan }}
          tooltipProps={{ title: 'Create Role' }}
          onClick={this.handleCreate}
          variant="circular"
          color="secondary">
          <PlusIcon />
        </Button>
        {dialogOpen && (
          <DialogAction
            open={dialogOpen}
            onSubmit={this.handleDeleteRole}
            onComplete={this.handleDialogActionComplete}
            onClose={this.handleDialogActionClose}
            onError={this.handleDialogActionError}
            error={dialogError}
            title="Delete Role?"
            body={
              <Typography variant="body2">
                This will delete the role {deleteRoleId}.
              </Typography>
            }
            confirmText="Delete Role"
          />
        )}
      </Dashboard>
    );
  }
}
