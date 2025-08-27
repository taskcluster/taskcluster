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
import hookGroupsQuery from './hookGroups.graphql';

@withApollo
@graphql(hookGroupsQuery, {
  options: {
    fetchPolicy: 'network-only',
  },
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
    const {
      classes,
      description,
      data: { loading, error, hookGroups },
    } = this.props;
    const { search } = parse(window.location.search.slice(1));
    const hookGroupIds = hookGroups?.map(group => group?.hookGroupId).flat();

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
          (hookGroupIds?.length ? (
            <HookGroupsTable
              searchTerm={search}
              hookGroups={hookGroupIds}
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
          variant="round"
          onClick={this.handleCreateHook}>
          <PlusIcon />
        </Button>
      </Dashboard>
    );
  }
}
