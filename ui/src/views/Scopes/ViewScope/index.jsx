import { hot } from 'react-hot-loader';
import React, { Component, Fragment } from 'react';
import { graphql } from 'react-apollo';
import { parse, stringify } from 'qs';
import dotProp from 'dot-prop-immutable';
import { withStyles } from '@material-ui/core/styles';
import Tabs from '@material-ui/core/Tabs';
import Tab from '@material-ui/core/Tab';
import Spinner from '../../../components/Spinner';
import Dashboard from '../../../components/Dashboard';
import Search from '../../../components/Search';
import ClientScopesTable from '../../../components/ClientScopesTable';
import RoleScopesTable from '../../../components/RoleScopesTable';
import { VIEW_CLIENT_SCOPES_INSPECT_SIZE } from '../../../utils/constants';
import ErrorPanel from '../../../components/ErrorPanel';
import scopesQuery from '../scopes.graphql';

@hot(module)
@graphql(scopesQuery)
@withStyles(theme => ({
  icon: {
    marginRight: theme.spacing(1),
  },
  tabs: {
    marginBottom: theme.spacing(3),
  },
}))
export default class ViewScope extends Component {
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

  handleSearchSubmit = searchTerm => {
    const { location, history } = this.props;
    const query = parse(location.search.slice(1));

    if (query.searchTerm !== searchTerm) {
      const newQuery = {
        ...query,
        searchTerm,
      };

      history.push({
        search: stringify(newQuery, { addQueryPrefix: true }),
      });
    }
  };

  handleTabChange = (event, value) => {
    const { location, history } = this.props;
    const query = parse(location.search.slice(1));

    if (query.tabIndex !== value) {
      const newQuery = {
        ...query,
        tabIndex: value,
      };

      history.push({
        search: stringify(newQuery, { addQueryPrefix: true }),
      });
    }
  };

  render() {
    const {
      classes,
      location,
      match: { params },
      data: { loading, error, clients, roles },
    } = this.props;
    const query = parse(location.search.slice(1));
    const searchTerm = query.searchTerm ? query.searchTerm : '';
    const currentTabIndex = query.tabIndex ? parseInt(query.tabIndex, 10) : 0;
    const selectedScope = decodeURIComponent(params.selectedScope);

    return (
      <Dashboard
        title={`Scope ${selectedScope}`}
        disableTitleFormatting
        search={
          <Search
            onSubmit={this.handleSearchSubmit}
            placeholder="Role/Client contains"
            defaultValue={searchTerm}
          />
        }>
        <Fragment>
          <Tabs
            className={classes.tabs}
            variant="fullWidth"
            value={currentTabIndex}
            onChange={this.handleTabChange}>
            <Tab label="Roles" />
            <Tab label="Clients" />
          </Tabs>
          {loading && <Spinner loading />}
          <ErrorPanel fixed error={error} />
          {roles && currentTabIndex === 0 && (
            <RoleScopesTable
              roles={roles}
              searchTerm={searchTerm}
              selectedScope={selectedScope}
            />
          )}
          {clients && currentTabIndex === 1 && (
            <ClientScopesTable
              clientsConnection={clients}
              onPageChange={this.handleClientsPageChange}
              searchTerm={searchTerm}
              selectedScope={selectedScope}
            />
          )}
        </Fragment>
      </Dashboard>
    );
  }
}
