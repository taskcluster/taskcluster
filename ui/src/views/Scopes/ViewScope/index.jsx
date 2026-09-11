import React, { Component } from 'react';
import { parse, stringify } from 'qs';
import { withStyles } from '@material-ui/core/styles';
import Tabs from '@material-ui/core/Tabs';
import Tab from '@material-ui/core/Tab';
import { Auth } from '@taskcluster/client-web';
import Spinner from '../../../components/Spinner';
import Dashboard from '../../../components/Dashboard';
import Search from '../../../components/Search';
import ClientScopesTable from '../../../components/ClientScopesTable';
import RoleScopesTable from '../../../components/RoleScopesTable';
import { VIEW_CLIENTS_PAGE_SIZE } from '../../../utils/constants';
import ErrorPanel from '../../../components/ErrorPanel';
import { withAuth } from '../../../utils/Auth';
import { withTaskclusterClient } from '../../../utils/TaskclusterClient';

@withAuth
@withTaskclusterClient
@withStyles(theme => ({
  icon: {
    marginRight: theme.spacing(1),
  },
  tabs: {
    marginBottom: theme.spacing(3),
  },
}))
export default class ViewScope extends Component {
  state = {
    roles: null,
    clients: null,
    loading: false,
    error: null,
  };

  get authClient() {
    return this.props.createTaskclusterClient({ Class: Auth });
  }

  componentDidMount() {
    this.load();
  }

  componentDidUpdate(prevProps) {
    if (this.props.user !== prevProps.user) {
      this.load();
    }
  }

  load = async () => {
    this.setState({ loading: true, error: null });

    try {
      // Matches the previous GraphQL behavior: a single page of clients (the
      // web-server connection loader capped this at 1000) plus all roles,
      // filtered client-side.
      const [roles, { clients }] = await Promise.all([
        this.authClient.listRoles(),
        this.authClient.listClients({ limit: VIEW_CLIENTS_PAGE_SIZE }),
      ]);

      this.setState({ roles, clients, loading: false, error: null });
    } catch (error) {
      this.setState({ roles: null, clients: null, loading: false, error });
    }
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

  handleTabChange = (_event, value) => {
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
    } = this.props;
    const { loading, error, clients, roles } = this.state;
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
            clients={clients}
            searchTerm={searchTerm}
            selectedScope={selectedScope}
          />
        )}
      </Dashboard>
    );
  }
}
