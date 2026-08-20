import React, { Component } from 'react';
import { Hooks } from '@taskcluster/client-web';
import { withStyles } from '@material-ui/core/styles';
import PlusIcon from 'mdi-react/PlusIcon';
import { parse, stringify } from 'qs';
import Typography from '@material-ui/core/Typography';
import Spinner from '../../../components/Spinner';
import Dashboard from '../../../components/Dashboard';
import HelpView from '../../../components/HelpView';
import Search from '../../../components/Search';
import Button from '../../../components/Button';
import ErrorPanel from '../../../components/ErrorPanel';
import HookGroupsTable from '../../../components/HookGroupsTable';
import { withTaskclusterClient } from '../../../utils/TaskclusterClient';

@withTaskclusterClient
@withStyles(theme => ({
  actionButton: {
    ...theme.mixins.fab,
  },
  listItemProps: {
    button: true,
    color: '#fff',
  },
  hasErrors: {
    '& td, & a': {
      color: theme.palette.error.main,
    },
  },
  noFires: {
    '& td, & a': {
      color: theme.palette.warning.light,
    },
  },
}))
export default class ListHookGroups extends Component {
  state = {
    loading: true,
    error: null,
    hookGroups: null,
  };

  get hooksClient() {
    return this.props.createTaskclusterClient({ Class: Hooks });
  }

  async componentDidMount() {
    await this.fetchHookGroups();
  }

  fetchHookGroups = async () => {
    this.setState({ loading: true, error: null });

    try {
      const result = await this.hooksClient.listHookGroups();

      this.setState({ loading: false, hookGroups: result.groups });
    } catch (error) {
      this.setState({ loading: false, error });
    }
  };

  handleCreateHook = () => {
    this.props.history.push('/hooks/create');
  };

  handleHookSearchSubmit = hookSearch => {
    const query = parse(window.location.search.slice(1));

    this.props.history.push({
      search: stringify({
        ...query,
        search: hookSearch,
      }),
    });
  };

  render() {
    const { classes, description } = this.props;
    const { loading, error, hookGroups } = this.state;
    const { search } = parse(window.location.search.slice(1));

    return (
      <Dashboard
        title="Hooks Groups"
        helpView={<HelpView description={description} />}
        search={
          <Search
            placeholder="Hook group contains"
            defaultValue={search}
            onSubmit={this.handleHookSearchSubmit}
          />
        }>
        {!hookGroups && loading && <Spinner loading />}
        <ErrorPanel fixed error={error} />
        {!loading &&
          (hookGroups?.length ? (
            <HookGroupsTable
              searchTerm={search}
              hookGroups={hookGroups}
              classes={classes}
            />
          ) : (
            <Typography variant="subtitle1">
              No hook groups are defined
            </Typography>
          ))}
        <Button
          spanProps={{ className: classes.actionButton }}
          tooltipProps={{ title: 'Create Hook' }}
          color="secondary"
          variant="circular"
          onClick={this.handleCreateHook}>
          <PlusIcon />
        </Button>
      </Dashboard>
    );
  }
}
