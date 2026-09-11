import React, { Component } from 'react';
import { parse, stringify } from 'qs';
import { withStyles } from '@material-ui/core/styles';
import Typography from '@material-ui/core/Typography';
import PlusIcon from 'mdi-react/PlusIcon';
import { Auth } from '@taskcluster/client-web';
import Spinner from '../../../components/Spinner';
import Dashboard from '../../../components/Dashboard';
import Search from '../../../components/Search';
import HelpView from '../../../components/HelpView';
import Button from '../../../components/Button';
import ClientsTable from '../../../components/ClientsTable';
import DialogAction from '../../../components/DialogAction';
import { VIEW_CLIENTS_PAGE_SIZE } from '../../../utils/constants';
import { withTaskclusterClient } from '../../../utils/TaskclusterClient';
import withPaginatedResource from '../../../hocs/withPaginatedResource';
import ErrorPanel from '../../../components/ErrorPanel';

@withStyles(theme => ({
  plusIcon: {
    ...theme.mixins.fab,
  },
}))
@withTaskclusterClient
@withPaginatedResource({
  fetch: props => options =>
    props.createTaskclusterClient({ Class: Auth }).listClients(options),
  payload: { limit: VIEW_CLIENTS_PAGE_SIZE },
  select: response => response.clients,
})
export default class ViewClients extends Component {
  state = {
    dialogOpen: false,
    dialogError: null,
    deleteClientId: null,
  };

  get searchTerm() {
    return parse(this.props.location.search.slice(1)).search || null;
  }

  get authClient() {
    return this.props.createTaskclusterClient({ Class: Auth });
  }

  handleClientSearchSubmit = search => {
    const { history, location, reload } = this.props;

    if ((search || null) === this.searchTerm) {
      reload();
      return;
    }

    history.push({
      search: stringify({
        ...parse(location.search.slice(1)),
        search: search,
      }),
    });
  };

  handleCreate = () => {
    this.props.history.push('/auth/clients/create');
  };

  handleDeleteClient = () => {
    this.setState({ dialogError: null });

    return this.authClient.deleteClient(this.state.deleteClientId);
  };

  handleDialogActionError = error => {
    this.setState({ dialogError: error });
  };

  handleDialogActionComplete = () => {
    this.setState({ dialogOpen: false, deleteClientId: null });
    this.props.reload();
  };

  handleDialogActionClose = () => {
    this.setState({
      dialogOpen: false,
      dialogError: null,
      deleteClientId: null,
    });
  };

  handleDialogActionOpen = clientId => {
    this.setState({ dialogOpen: true, deleteClientId: clientId });
  };

  render() {
    const { dialogOpen, dialogError, deleteClientId } = this.state;
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
    const { searchTerm } = this;
    const clients = searchTerm
      ? items.filter(({ clientId }) =>
          clientId.toLowerCase().includes(searchTerm.toLowerCase())
        )
      : items;
    const initialLoad = loading && !items.length;

    return (
      <Dashboard
        title="Clients"
        helpView={<HelpView description={description} />}
        search={
          <Search
            defaultValue={searchTerm}
            disabled={loading}
            onSubmit={this.handleClientSearchSubmit}
            placeholder="Client contains"
          />
        }>
        {initialLoad && <Spinner loading />}
        <ErrorPanel fixed error={error} />
        {!initialLoad && (
          <ClientsTable
            searchTerm={searchTerm}
            clients={clients}
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
          onClick={this.handleCreate}
          variant="circular"
          color="secondary"
          className={classes.plusIcon}>
          <PlusIcon />
        </Button>
        {dialogOpen && (
          <DialogAction
            open={dialogOpen}
            onSubmit={this.handleDeleteClient}
            onComplete={this.handleDialogActionComplete}
            onClose={this.handleDialogActionClose}
            onError={this.handleDialogActionError}
            error={dialogError}
            title="Delete Client?"
            body={
              <Typography variant="body2">
                This will delete the {deleteClientId} client.
              </Typography>
            }
            confirmText="Delete Client"
          />
        )}
      </Dashboard>
    );
  }
}
