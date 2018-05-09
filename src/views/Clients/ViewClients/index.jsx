import { PureComponent, Fragment } from 'react';
import { hot } from 'react-hot-loader';
import { graphql } from 'react-apollo';
import { withStyles } from 'material-ui/styles';
import Button from 'material-ui/Button';
import PlusIcon from 'mdi-react/PlusIcon';
import dotProp from 'dot-prop-immutable';
import Dashboard from '../../../components/Dashboard';
import Search from '../../../components/Search';
import Spinner from '../../../components/Spinner';
import ErrorPanel from '../../../components/ErrorPanel';
import ClientsTable from '../../../components/ClientsTable';
import { VIEW_CLIENTS_PAGE_SIZE } from '../../../utils/constants';
import clientsQuery from './clients.graphql';

@hot(module)
@graphql(clientsQuery, {
  options: () => ({
    variables: {
      clientsConnection: {
        limit: VIEW_CLIENTS_PAGE_SIZE,
      },
    },
  }),
})
@withStyles(theme => ({
  plusIcon: {
    position: 'fixed',
    bottom: theme.spacing.double,
    right: theme.spacing.triple,
  },
}))
export default class ViewWorker extends PureComponent {
  state = {
    clientSearch: '',
  };

  handlePageChange = ({ cursor, previousCursor }) => {
    const {
      data: { fetchMore },
    } = this.props;

    return fetchMore({
      query: clientsQuery,
      variables: {
        clientsConnection: {
          limit: VIEW_CLIENTS_PAGE_SIZE,
          cursor,
          previousCursor,
        },
        ...(this.state.clientSearch
          ? {
              clientOptions: {
                prefix: this.state.clientSearch,
              },
            }
          : null),
      },
      updateQuery(previousResult, { fetchMoreResult }) {
        const { edges, pageInfo } = fetchMoreResult.clients;

        if (!edges.length) {
          return previousResult;
        }

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

  handleClientSearchChange = ({ target }) => {
    this.setState({ clientSearch: target.value });
  };

  handleClientSearchSubmit = e => {
    e.preventDefault();

    const {
      data: { refetch },
    } = this.props;
    const { clientSearch } = this.state;

    refetch({
      ...(clientSearch
        ? {
            clientOptions: {
              prefix: clientSearch,
            },
          }
        : null),
      clientsConnection: {
        limit: VIEW_CLIENTS_PAGE_SIZE,
      },
    });
  };

  handleCreate = () => {
    this.props.history.push('/auth/clients/create');
  };

  render() {
    const {
      classes,
      user,
      onSignIn,
      onSignOut,
      data: { loading, error, clients },
    } = this.props;
    const { clientSearch } = this.state;

    return (
      <Dashboard
        title="Clients"
        search={
          <Search
            disabled={loading}
            value={clientSearch}
            onChange={this.handleClientSearchChange}
            onSubmit={this.handleClientSearchSubmit}
            placeholder="Client starts with"
          />
        }
        user={user}
        onSignIn={onSignIn}
        onSignOut={onSignOut}>
        <Fragment>
          {!clients && loading && <Spinner loading />}
          {error && error.graphQLErrors && <ErrorPanel error={error} />}
          {clients && (
            <ClientsTable
              onPageChange={this.handlePageChange}
              clientsConnection={clients}
            />
          )}
          <Button
            onClick={this.handleCreate}
            variant="fab"
            color="secondary"
            className={classes.plusIcon}>
            <PlusIcon />
          </Button>
        </Fragment>
      </Dashboard>
    );
  }
}
