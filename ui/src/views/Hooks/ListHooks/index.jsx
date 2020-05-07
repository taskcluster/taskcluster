import { hot } from 'react-hot-loader';
import React, { Component } from 'react';
import { graphql } from 'react-apollo';
import Spinner from '@mozilla-frontend-infra/components/Spinner';
import { withStyles } from '@material-ui/core/styles';
import Typography from '@material-ui/core/Typography';
import MuiTreeView from 'material-ui-treeview';
import PlusIcon from 'mdi-react/PlusIcon';
import qs, { parse, stringify } from 'qs';
import Dashboard from '../../../components/Dashboard';
import HelpView from '../../../components/HelpView';
import Search from '../../../components/Search';
import Button from '../../../components/Button';
import ErrorPanel from '../../../components/ErrorPanel';
import Link from '../../../utils/Link';
import hooksQuery from './hooks.graphql';

@hot(module)
@graphql(hooksQuery, {
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
}))
export default class ListHooks extends Component {
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
    const query = qs.parse(this.props.location.search.slice(1));
    const hookSearch = query.search;
    const tree = hookGroups
      ? hookGroups.map(group => ({
          value: group.hookGroupId,
          nodes: group.hooks.map(hook => ({
            value: hook.hookId,
            href: `/hooks/${group.hookGroupId}/${encodeURIComponent(
              hook.hookId
            )}`,
          })),
        }))
      : [];

    return (
      <Dashboard
        title="Hooks"
        helpView={<HelpView description={description} />}
        search={
          <Search
            placeholder="Hook contains"
            defaultValue={hookSearch}
            onSubmit={this.handleHookSearchSubmit}
          />
        }>
        {!hookGroups && loading && <Spinner loading />}
        <ErrorPanel fixed error={error} />
        {hookGroups && (
          <MuiTreeView
            // key is necessary to expand the list of hook when searching
            key={hookSearch}
            defaultExpanded={Boolean(hookSearch)}
            listItemProps={{ color: classes.listItemProps }}
            searchTerm={hookSearch || null}
            softSearch
            tree={tree}
            onEmptySearch={
              <Typography variant="subtitle1">
                No items for search term {hookSearch}
              </Typography>
            }
            Link={Link}
          />
        )}
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
