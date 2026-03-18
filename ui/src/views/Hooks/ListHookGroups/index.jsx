import React, { Component } from 'react';
import { graphql, withApollo } from 'react-apollo';
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
import HooksListTable from '../../../components/HooksListTable';
import hookGroupsQuery from './hookGroups.graphql';
import searchHooksQuery from './searchHooks.graphql';

@withApollo
@graphql(hookGroupsQuery, {
  skip: ownProps => !!parse(ownProps.location.search.slice(1)).search,
  options: () => ({
    fetchPolicy: 'network-only',
  }),
  name: 'hookGroupsData',
})
@graphql(searchHooksQuery, {
  skip: ownProps => !parse(ownProps.location.search.slice(1)).search,
  options: ownProps => {
    const { search } = parse(ownProps.location.search.slice(1));

    return {
      fetchPolicy: 'network-only',
      variables: { query: search },
    };
  },
  name: 'searchData',
})
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
    const { search } = parse(window.location.search.slice(1));

    if (search) {
      const { loading, error, searchHooks } = this.props.searchData || {};

      return (
        <Dashboard
          title="Hooks Groups"
          helpView={<HelpView description={description} />}
          search={
            <Search
              placeholder="Hook group or hook ID contains"
              defaultValue={search}
              onSubmit={this.handleHookSearchSubmit}
            />
          }>
          {!searchHooks && loading && <Spinner loading />}
          <ErrorPanel fixed error={error} />
          {!loading &&
            (searchHooks?.length ? (
              <HooksListTable hooks={searchHooks} classes={classes} />
            ) : (
              <Typography variant="subtitle1">
                No hooks match your search
              </Typography>
            ))}
          <Button
            spanProps={{ className: classes.actionButton }}
            tooltipProps={{ title: 'Create Hook' }}
            color="secondary"
            variant="round"
            onClick={this.handleCreateHook}>
            <PlusIcon />
          </Button>
        </Dashboard>
      );
    }

    const { loading, error, hookGroups } = this.props.hookGroupsData || {};
    const hookGroupIds = hookGroups?.map(group => group?.hookGroupId).flat();

    return (
      <Dashboard
        title="Hooks Groups"
        helpView={<HelpView description={description} />}
        search={
          <Search
            placeholder="Hook group or hook ID contains"
            defaultValue={search}
            onSubmit={this.handleHookSearchSubmit}
          />
        }>
        {!hookGroups && loading && <Spinner loading />}
        <ErrorPanel fixed error={error} />
        {!loading &&
          (hookGroupIds?.length ? (
            <HookGroupsTable hookGroups={hookGroupIds} classes={classes} />
          ) : (
            <Typography variant="subtitle1">
              No hook groups are defined
            </Typography>
          ))}
        <Button
          spanProps={{ className: classes.actionButton }}
          tooltipProps={{ title: 'Create Hook' }}
          color="secondary"
          variant="round"
          onClick={this.handleCreateHook}>
          <PlusIcon />
        </Button>
      </Dashboard>
    );
  }
}
