import React, { PureComponent, Fragment } from 'react';
import { hot } from 'react-hot-loader';
import { graphql, withApollo } from 'react-apollo';
import { parse, stringify } from 'qs';
import { withStyles } from '@material-ui/core/styles';
import Typography from '@material-ui/core/Typography';
import PlusIcon from 'mdi-react/PlusIcon';
import dotProp from 'dot-prop-immutable';
import escapeStringRegexp from 'escape-string-regexp';
import Spinner from '../../../components/Spinner';
import Dashboard from '../../../components/Dashboard';
import Search from '../../../components/Search';
import HelpView from '../../../components/HelpView';
import Button from '../../../components/Button';
import ClientsTable from '../../../components/ClientsTable';
import DialogAction from '../../../components/DialogAction';
import { VIEW_CLIENTS_PAGE_SIZE } from '../../../utils/constants';
import clientsQuery from './clients.graphql';
import deleteClientQuery from './deleteClient.graphql';
import ErrorPanel from '../../../components/ErrorPanel';

@hot(module)
@withApollo
@graphql(clientsQuery, {
  options: props => ({
    fetchPolicy: 'network-only',
    variables: {
      clientOptions: null,
      clientsConnection: {
        limit: VIEW_CLIENTS_PAGE_SIZE,
      },
      filter: props.history.location.search
        ? {
            clientId: {
              $regex: escapeStringRegexp(
                parse(props.history.location.search.slice(1)).search
              ),
              $options: 'i',
            },
          }
        : null,
    },
  }),
})
@withStyles(theme => ({
  plusIcon: {
    ...theme.mixins.fab,
  },
}))
export default class ViewClients extends PureComponent {
  state = {
    dialogOpen: false,
    dialogError: null,
    deleteClientId: null,
  };

  handleClientSearchSubmit = async search => {
    const {
      data: { refetch },
    } = this.props;
    const searchQuery = this.props.history.location.search
      ? parse(this.props.history.location.search.slice(1)).search
      : '';

    await refetch({
      clientOptions: null,
      clientsConnection: {
        limit: VIEW_CLIENTS_PAGE_SIZE,
      },
      filter: search
        ? { clientId: { $regex: escapeStringRegexp(search), $options: 'i' } }
        : null,
    });

    if (search !== searchQuery) {
      this.props.history.push(
        search.length > 0 ? `?${stringify({ search })}` : '/auth/clients'
      );
    }
  };

  handleCreate = () => {
    this.props.history.push('/auth/clients/create');
  };

  handleDeleteClient = async () => {
    this.setState({ dialogError: null });

    const clientId = this.state.deleteClientId;

    return this.props.client.mutate({
      mutation: deleteClientQuery,
      variables: { clientId },
    });
  };

  handleDialogActionError = error => {
    this.setState({ dialogError: error });
  };

  handleDialogActionComplete = () => {
    this.setState({ dialogOpen: false, deleteClientId: null });

    this.props.data.refetch();
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

  handlePageChange = ({ cursor, previousCursor }) => {
    const {
      data: { fetchMore },
      history,
    } = this.props;

    return fetchMore({
      query: clientsQuery,
      variables: {
        clientsConnection: {
          limit: VIEW_CLIENTS_PAGE_SIZE,
          cursor,
          previousCursor,
        },
        clientOptions: null,
        ...(history.location.search
          ? {
              filter: {
                clientId: {
                  $regex: escapeStringRegexp(
                    parse(history.location.search.slice(1)).search
                  ),
                  $options: 'i',
                },
              },
            }
          : null),
      },
      updateQuery(previousResult, { fetchMoreResult }) {
        const { edges, pageInfo } = fetchMoreResult.clients;

        return dotProp.set(previousResult, 'clients', clients =>
          dotProp.set(
            dotProp.set(clients, 'edges', edges),
            'pageInfo',
            pageInfo
          )
        );
      },
    });
  };

  render() {
    const { dialogOpen, dialogError, deleteClientId } = this.state;
    const {
      classes,
      description,
      location,
      data: { loading, error, clients },
    } = this.props;
    const searchQuery = parse(location.search.slice(1));
    const searchTerm = searchQuery.search;

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
        <Fragment>
          {loading && <Spinner loading />}
          <ErrorPanel fixed error={error} />
          {clients && (
            <ClientsTable
              searchTerm={searchTerm}
              onPageChange={this.handlePageChange}
              clientsConnection={clients}
              onDialogActionOpen={this.handleDialogActionOpen}
            />
          )}
          <Button
            onClick={this.handleCreate}
            variant="round"
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
        </Fragment>
      </Dashboard>
    );
  }
}
