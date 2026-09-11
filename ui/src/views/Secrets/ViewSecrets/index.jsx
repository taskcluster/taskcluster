import React, { Component } from 'react';
import { Secrets } from '@taskcluster/client-web';
import { withStyles } from '@material-ui/core/styles';
import Typography from '@material-ui/core/Typography';
import PlusIcon from 'mdi-react/PlusIcon';
import qs from 'qs';
import Spinner from '../../../components/Spinner';
import Dashboard from '../../../components/Dashboard';
import Search from '../../../components/Search';
import SecretsTable from '../../../components/SecretsTable';
import HelpView from '../../../components/HelpView';
import Button from '../../../components/Button';
import ErrorPanel from '../../../components/ErrorPanel';
import DialogAction from '../../../components/DialogAction';
import withPaginatedResource from '../../../hocs/withPaginatedResource';
import { VIEW_SECRETS_PAGE_SIZE } from '../../../utils/constants';
import { withTaskclusterClient } from '../../../utils/TaskclusterClient';

@withStyles(theme => ({
  plusIconSpan: {
    ...theme.mixins.fab,
  },
}))
@withTaskclusterClient
@withPaginatedResource({
  fetch: props => options =>
    props.createTaskclusterClient({ Class: Secrets }).list(options),
  payload: { limit: VIEW_SECRETS_PAGE_SIZE },
  select: response => response.secrets,
})
export default class ViewSecrets extends Component {
  state = {
    dialogOpen: false,
    deleteSecretName: null,
    dialogError: null,
  };

  get searchTerm() {
    return qs.parse(this.props.location.search.slice(1)).search || null;
  }

  get secretsClient() {
    return this.props.createTaskclusterClient({ Class: Secrets });
  }

  handleSearchSubmit = secretSearch => {
    const { history, location, reload } = this.props;

    if ((secretSearch || null) === this.searchTerm) {
      reload();
      return;
    }

    history.push({
      search: qs.stringify({
        ...qs.parse(location.search.slice(1)),
        search: secretSearch,
      }),
    });
  };

  handleCreate = () => {
    this.props.history.push('/secrets/create');
  };

  handleDeleteSecret = () =>
    this.secretsClient.remove(this.state.deleteSecretName);

  handleDialogActionComplete = () => {
    this.setState({ dialogOpen: false, deleteSecretName: null });
    this.props.reload();
  };

  handleDialogActionClose = () => {
    this.setState({
      dialogOpen: false,
      deleteSecretName: null,
      dialogError: null,
    });
  };

  handleDialogActionError = error => {
    this.setState({ dialogError: error });
  };

  handleDialogActionOpen = secretName => {
    this.setState({ dialogOpen: true, deleteSecretName: secretName });
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
    const { dialogOpen, deleteSecretName, dialogError } = this.state;
    const { searchTerm } = this;
    const secrets = searchTerm
      ? items.filter(name =>
          name.toLowerCase().includes(searchTerm.toLowerCase())
        )
      : items;
    // Separates the first load, which has nothing to show yet, from paging,
    // where the table stays up and the pagination row spins.
    const initialLoad = loading && !items.length;

    return (
      <Dashboard
        title="Secrets"
        helpView={<HelpView description={description} />}
        search={
          <Search
            disabled={loading}
            defaultValue={searchTerm}
            onSubmit={this.handleSearchSubmit}
            placeholder="Secret contains"
          />
        }>
        {initialLoad && <Spinner loading />}
        <ErrorPanel fixed error={error} />
        {!initialLoad && (
          <SecretsTable
            secrets={secrets}
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
          tooltipProps={{
            title: 'Create Secret',
            id: 'create-secret-tooltip',
            enterDelay: 300,
          }}
          onClick={this.handleCreate}
          variant="circular"
          color="secondary">
          <PlusIcon />
        </Button>
        {dialogOpen && (
          <DialogAction
            open={dialogOpen}
            onSubmit={this.handleDeleteSecret}
            onComplete={this.handleDialogActionComplete}
            onClose={this.handleDialogActionClose}
            onError={this.handleDialogActionError}
            error={dialogError}
            title="Delete Secret?"
            body={
              <Typography variant="body2">
                This will delete the secret {deleteSecretName}.
              </Typography>
            }
            confirmText="Delete Secret"
          />
        )}
      </Dashboard>
    );
  }
}
