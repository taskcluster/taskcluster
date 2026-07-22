import React, { Component } from 'react';
import { withApollo } from '@apollo/client/react/hoc';
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
import { VIEW_SECRETS_PAGE_SIZE } from '../../../utils/constants';
import { withAuth } from '../../../utils/Auth';
import { getClient } from '../../../utils/client';
import ErrorPanel from '../../../components/ErrorPanel';
import DialogAction from '../../../components/DialogAction';
import deleteSecretQuery from './deleteSecret.graphql';

const FIRST_PAGE = '$$FIRST$$';

@withApollo
@withAuth
@withStyles(theme => ({
  plusIconSpan: {
    ...theme.mixins.fab,
  },
}))
export default class ViewSecrets extends Component {
  fetchRequestId = 0;

  state = {
    loading: true,
    error: null,
    secrets: null,
    pageInfo: null,
    dialogOpen: false,
    deleteSecretName: null,
    dialogError: null,
  };

  componentDidMount() {
    if (this.props.authReady) {
      this.fetchSecrets();
    }
  }

  componentDidUpdate(prevProps) {
    const authBecameReady = !prevProps.authReady && this.props.authReady;
    const userChanged =
      this.props.authReady && prevProps.user !== this.props.user;

    if (authBecameReady || userChanged) {
      this.fetchSecrets();
    }
  }

  componentWillUnmount() {
    this.fetchRequestId += 1;
  }

  fetchSecrets = async ({
    cursor,
    previousCursor,
    searchTerm = qs.parse(this.props.location.search.slice(1)).search,
  } = {}) => {
    const requestId = ++this.fetchRequestId;
    const options = { limit: VIEW_SECRETS_PAGE_SIZE };

    if (cursor && cursor !== FIRST_PAGE) {
      options.continuationToken = cursor;
    }

    this.setState({ loading: true, error: null });

    try {
      const client = getClient({ Class: Secrets, user: this.props.user });
      const response = await client.list(options);

      if (requestId !== this.fetchRequestId) {
        return;
      }

      const needle = searchTerm?.toLowerCase();

      this.setState({
        loading: false,
        secrets: needle
          ? response.secrets.filter(name => name.toLowerCase().includes(needle))
          : response.secrets,
        pageInfo: {
          hasNextPage: Boolean(response.continuationToken),
          hasPreviousPage: Boolean(cursor) && cursor !== FIRST_PAGE,
          cursor: cursor || FIRST_PAGE,
          previousCursor,
          nextCursor: response.continuationToken,
        },
      });
    } catch (error) {
      if (requestId === this.fetchRequestId) {
        this.setState({ loading: false, error });
      }
    }
  };

  handleSecretSearchSubmit = async secretSearch => {
    await this.fetchSecrets({ searchTerm: secretSearch || null });

    const query = qs.parse(window.location.search.slice(1));

    this.props.history.push({
      search: qs.stringify({
        ...query,
        search: secretSearch,
      }),
    });
  };

  handleCreate = () => {
    this.props.history.push('/secrets/create');
  };

  handlePageChange = ({ cursor, previousCursor }) => {
    return this.fetchSecrets({ cursor, previousCursor });
  };

  handleDeleteSecret = () => {
    this.setState({ dialogError: null });

    const name = this.state.deleteSecretName;

    return this.props.client.mutate({
      mutation: deleteSecretQuery,
      variables: { name },
    });
  };

  handleDialogActionError = error => {
    this.setState({ dialogError: error });
  };

  handleDialogActionComplete = () => {
    this.setState({ dialogOpen: false, deleteSecretName: null });

    this.fetchSecrets();
  };

  handleDialogActionClose = () => {
    this.setState({
      dialogOpen: false,
      deleteSecretName: null,
      dialogError: null,
    });
  };

  handleDialogActionOpen = secretName => {
    this.setState({ dialogOpen: true, deleteSecretName: secretName });
  };

  render() {
    const {
      dialogOpen,
      deleteSecretName,
      dialogError,
      loading,
      error,
      secrets,
      pageInfo,
    } = this.state;
    const { classes, description } = this.props;
    const query = qs.parse(this.props.location.search.slice(1));
    const secretSearch = query.search;

    return (
      <Dashboard
        title="Secrets"
        helpView={<HelpView description={description} />}
        search={
          <Search
            disabled={loading}
            defaultValue={secretSearch}
            onSubmit={this.handleSecretSearchSubmit}
            placeholder="Secret contains"
          />
        }>
        {loading && <Spinner loading />}
        <ErrorPanel fixed error={error} />
        {secrets && (
          <SecretsTable
            secrets={secrets}
            pageInfo={pageInfo}
            searchTerm={secretSearch}
            onPageChange={this.handlePageChange}
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
