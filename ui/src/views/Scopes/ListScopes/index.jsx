import React, { PureComponent, Fragment } from 'react';
import { hot } from 'react-hot-loader';
import { graphql } from 'react-apollo';
import { withRouter } from 'react-router-dom';
import dotProp from 'dot-prop-immutable';
import Spinner from '@mozilla-frontend-infra/components/Spinner';
import { withStyles } from '@material-ui/core/styles';
import Tabs from '@material-ui/core/Tabs';
import Tab from '@material-ui/core/Tab';
import Dashboard from '../../../components/Dashboard';
import RoleScopesTable from '../../../components/RoleScopesTable';
import ClientScopesTable from '../../../components/ClientScopesTable';
import HelpView from '../../../components/HelpView';
import Search from '../../../components/Search';
import { VIEW_CLIENT_SCOPES_INSPECT_SIZE } from '../../../utils/constants';
import ErrorPanel from '../../../components/ErrorPanel';
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
    marginBottom: theme.spacing(3),
  },
}))
export default class ListScopes extends PureComponent {
  state = {
    searchTerm: '',
    currentTabIndex: 0,
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

  handleSearchSubmit = searchTerm => {
    this.setState({ searchTerm });
  };

  handleTabChange = (event, value) => {
    this.setState({ currentTabIndex: value });
  };

  render() {
    const {
      classes,
      description,
      data: { loading, error, clients, roles },
    } = this.props;
    const { searchTerm, currentTabIndex } = this.state;

    return (
      <Dashboard
        title="Scopes"
        helpView={<HelpView description={description} />}
        search={
          <Search
            placeholder="Scope contains"
            onSubmit={this.handleSearchSubmit}
          />
        }>
        <Fragment>
          <ErrorPanel fixed error={error} />
          {loading && <Spinner loading />}
          {!loading && (
            <Fragment>
              <Tabs
                className={classes.tabs}
                variant="fullWidth"
                value={currentTabIndex}
                onChange={this.handleTabChange}>
                <Tab label="Roles" />
                <Tab label="Clients" />
              </Tabs>
              {roles && currentTabIndex === 0 && (
                <RoleScopesTable roles={roles} searchTerm={searchTerm} />
              )}
              {clients && currentTabIndex === 1 && (
                <ClientScopesTable
                  searchTerm={searchTerm}
                  onPageChange={this.handleClientsPageChange}
                  clientsConnection={clients}
                />
              )}
            </Fragment>
          )}
        </Fragment>
      </Dashboard>
    );
  }
}
