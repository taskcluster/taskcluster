import { hot } from 'react-hot-loader';
import React, { Component } from 'react';
import { graphql } from 'react-apollo';
import { prop, map } from 'ramda';
import ErrorPanel from '@mozilla-frontend-infra/components/ErrorPanel';
import Spinner from '@mozilla-frontend-infra/components/Spinner';
import { withStyles } from '@material-ui/core/styles';
import Tooltip from '@material-ui/core/Tooltip';
import MuiTreeView from 'material-ui-treeview';
import PlusIcon from 'mdi-react/PlusIcon';
import Dashboard from '../../../components/Dashboard';
import HelpView from '../../../components/HelpView';
import Search from '../../../components/Search';
import Button from '../../../components/Button';
import hooksQuery from './hooks.graphql';

@hot(module)
@graphql(hooksQuery)
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
  state = {
    hookSearch: '',
  };

  handleCreateHook = () => {
    this.props.history.push('/hooks/create');
  };

  handleHookSearchChange = e => {
    this.setState({ hookSearch: e.target.value || '' });
  };

  handleLeafClick = (leaf, parent) => {
    this.props.history.push(`/hooks/${parent.value}/${leaf}`);
  };

  render() {
    const {
      classes,
      description,
      data: { loading, error, hookGroups },
    } = this.props;
    const { hookSearch } = this.state;
    const tree = hookGroups
      ? hookGroups.map(group => ({
          value: group.hookGroupId,
          nodes: map(prop('hookId'), group.hooks),
        }))
      : [];

    return (
      <Dashboard
        title="Hooks"
        helpView={<HelpView description={description} />}
        search={
          <Search
            value={hookSearch}
            placeholder="Hook contains"
            onChange={this.handleHookSearchChange}
          />
        }
      >
        {!hookGroups && loading && <Spinner loading />}
        {error && error.graphQLErrors && <ErrorPanel error={error} />}
        {hookGroups && (
          <MuiTreeView
            listItemProps={{ color: classes.listItemProps }}
            searchTerm={hookSearch || null}
            tree={tree}
            onLeafClick={this.handleLeafClick}
          />
        )}
        <Tooltip title="Create Hook">
          <Button
            color="secondary"
            variant="fab"
            onClick={this.handleCreateHook}
            className={classes.actionButton}
          >
            <PlusIcon />
          </Button>
        </Tooltip>
      </Dashboard>
    );
  }
}
