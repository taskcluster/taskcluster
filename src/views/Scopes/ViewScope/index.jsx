import { hot } from 'react-hot-loader';
import { Component, Fragment } from 'react';
import { graphql } from 'react-apollo';
import dotProp from 'dot-prop-immutable';
import { withStyles } from '@material-ui/core/styles';
import Divider from '@material-ui/core/Divider';
import MenuItem from '@material-ui/core/MenuItem';
import Tabs from '@material-ui/core/Tabs';
import Tab from '@material-ui/core/Tab';
import TextField from '@material-ui/core/TextField';
import CheckIcon from 'mdi-react/CheckIcon';
import Dashboard from '../../../components/Dashboard';
import Search from '../../../components/Search';
import Spinner from '../../../components/Spinner';
import ErrorPanel from '../../../components/ErrorPanel';
import ClientScopesTable from '../../../components/ClientScopesTable';
import RoleScopesTable from '../../../components/RoleScopesTable';
import {
  VIEW_CLIENT_SCOPES_INSPECT_SIZE,
  SCOPES_SEARCH_MODE,
} from '../../../utils/constants';
import scopesQuery from '../scopes.graphql';

@hot(module)
@graphql(scopesQuery)
@withStyles(theme => ({
  icon: {
    marginRight: theme.spacing.unit,
  },
  tabs: {
    marginBottom: theme.spacing.triple,
  },
  toolbox: {
    display: 'flex',
    flexDirection: 'row-reverse',
  },
  dropdown: {
    minWidth: 200,
  },
}))
export default class ViewScope extends Component {
  state = {
    searchTerm: '',
    searchMode: SCOPES_SEARCH_MODE.HAS_SCOPE,
    directEntitySearch: false,
    currentTabIndex: 0,
  };

  handleSearchChange = ({ target: { value } }) => {
    this.setState({ searchTerm: value });
  };

  handleMatchChange = ({ target: { value } }) => {
    value === 'Direct Ownership'
      ? this.setState({ directEntitySearch: !this.state.directEntitySearch })
      : this.setState({ searchMode: value });
  };

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

  render() {
    const {
      classes,
      match: { params },
      user,
      onSignIn,
      onSignOut,
      data: { loading, error, clients, roles },
    } = this.props;
    const {
      searchTerm,
      searchMode,
      directEntitySearch,
      currentTabIndex,
    } = this.state;
    const selectedScope = decodeURIComponent(params.selectedScope);
    const searchProperty = this.state.directEntitySearch
      ? 'scopes'
      : 'expandedScopes';

    return (
      <Dashboard
        title={selectedScope}
        user={user}
        search={
          <Search
            value={searchTerm}
            onChange={this.handleSearchChange}
            placeholder="Result contains"
          />
        }
        onSignIn={onSignIn}
        onSignOut={onSignOut}>
        <Fragment>
          <div className={classes.toolbox}>
            <TextField
              disabled={loading}
              className={classes.dropdown}
              select
              label="Scope Match"
              value={searchMode}
              onChange={this.handleMatchChange}>
              <MenuItem value={SCOPES_SEARCH_MODE.HAS_SCOPE}>
                Has Scope
              </MenuItem>
              <MenuItem value={SCOPES_SEARCH_MODE.HAS_SUB_SCOPE}>
                Has Sub-scope
              </MenuItem>
              <MenuItem value={SCOPES_SEARCH_MODE.EXACT}>Exact</MenuItem>
              <Divider />
              <MenuItem selected={directEntitySearch} value="Direct Ownership">
                {directEntitySearch && <CheckIcon className={classes.icon} />}
                Direct Ownership
              </MenuItem>
            </TextField>
          </div>
          <Tabs
            className={classes.tabs}
            fullWidth
            value={currentTabIndex}
            onChange={this.handleTabChange}>
            <Tab label="Roles" />
            <Tab label="Clients" />
          </Tabs>
          {!(clients && roles) && loading && <Spinner loading />}
          {error && error.graphQLErrors && <ErrorPanel error={error} />}
          {roles &&
            currentTabIndex === 0 && (
              <RoleScopesTable
                roles={roles}
                searchTerm={searchTerm}
                searchMode={searchMode}
                selectedScope={selectedScope}
                searchProperty={searchProperty}
              />
            )}
          {clients &&
            currentTabIndex === 1 && (
              <ClientScopesTable
                clientsConnection={clients}
                onPageChange={this.handleClientsPageChange}
                searchTerm={searchTerm}
                searchMode={searchMode}
                selectedScope={selectedScope}
                searchProperty={searchProperty}
              />
            )}
        </Fragment>
      </Dashboard>
    );
  }
}
