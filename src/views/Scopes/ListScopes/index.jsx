import { PureComponent, Fragment } from 'react';
import { hot } from 'react-hot-loader';
import { graphql } from 'react-apollo';
import { withRouter } from 'react-router-dom';
import dotProp from 'dot-prop-immutable';
import ErrorPanel from '@mozilla-frontend-infra/components/ErrorPanel';
import Spinner from '@mozilla-frontend-infra/components/Spinner';
import { withStyles } from '@material-ui/core/styles';
import Tabs from '@material-ui/core/Tabs';
import Tab from '@material-ui/core/Tab';
import Dashboard from '../../../components/Dashboard';
import RoleScopesTable from '../../../components/RoleScopesTable';
import ClientScopesTable from '../../../components/ClientScopesTable';
import Search from '../../../components/Search';
import { VIEW_CLIENT_SCOPES_INSPECT_SIZE } from '../../../utils/constants';
import scopesQuery from '../scopes.graphql';

@hot(module)
@withRouter
@graphql(scopesQuery, {
  options: () => ({
    variables: {
      clientsConnection: {
        limit: VIEW_CLIENT_SCOPES_INSPECT_SIZE,
      },
    },
  }),
})
@withStyles(theme => ({
  tabs: {
    marginBottom: theme.spacing.triple,
  },
}))
export default class ListScopes extends PureComponent {
  state = {
    searchTerm: '',
    currentTabIndex: 0,
  };

  clientScopes = null;

  handleTabChange = (event, value) => {
    this.setState({ currentTabIndex: value });
  };

  handleClientsPageChange = ({ cursor, previousCursor }) => {
    const {
      data: { fetchMore },
    } = this.props;

    return fetchMore({
      query: scopesQuery,
      variables: {
        clientsConnection: {
          limit: VIEW_CLIENT_SCOPES_INSPECT_SIZE,
          cursor,
          previousCursor,
        },
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

  handleSearchChange = ({ target: { value } }) => {
    this.setState({ searchTerm: value });
  };

  render() {
    const {
      classes,
      data: { loading, error, clients, roles },
    } = this.props;
    const { searchTerm, currentTabIndex } = this.state;

    return (
      <Dashboard
        title="Scopes"
        search={
          <Search
            value={searchTerm}
            placeholder="Scope contains"
            onChange={this.handleSearchChange}
          />
        }>
        <Fragment>
          {error && error.graphQLErrors && <ErrorPanel error={error} />}
          <Tabs
            className={classes.tabs}
            fullWidth
            value={currentTabIndex}
            onChange={this.handleTabChange}>
            <Tab label="Roles" />
            <Tab label="Clients" />
          </Tabs>
          {!(clients && roles) && loading && <Spinner loading />}
          {roles &&
            currentTabIndex === 0 && (
              <RoleScopesTable roles={roles} searchTerm={searchTerm} />
            )}
          {clients &&
            currentTabIndex === 1 && (
              <ClientScopesTable
                searchTerm={searchTerm}
                onPageChange={this.handleClientsPageChange}
                clientsConnection={clients}
              />
            )}
        </Fragment>
      </Dashboard>
    );
  }
}
