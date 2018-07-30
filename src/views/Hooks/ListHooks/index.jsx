import { hot } from 'react-hot-loader';
import { Component } from 'react';
import { graphql } from 'react-apollo';
import { prop, map } from 'ramda';
import ErrorPanel from '@mozilla-frontend-infra/components/ErrorPanel';
import Spinner from '@mozilla-frontend-infra/components/Spinner';
import { withStyles } from '@material-ui/core/styles';
import Tooltip from '@material-ui/core/Tooltip';
import Button from '@material-ui/core/Button';
import MuiTreeView from 'material-ui-treeview';
import PlusIcon from 'mdi-react/PlusIcon';
import Dashboard from '../../../components/Dashboard';
import Search from '../../../components/Search';
import hooksQuery from './hooks.graphql';

@hot(module)
@graphql(hooksQuery)
@withStyles(theme => ({
  actionButton: {
    ...theme.mixins.fab,
  },
}))
export default class ListHooks extends Component {
  state = {
    hookSearch: '',
  };

  handleHookSearchChange = e => {
    this.setState({ hookSearch: e.target.value || '' });
  };

  handleLeafClick = (leaf, parent) => {
    this.props.history.push(`/hooks/${parent.value}/${leaf}`);
  };

  handleCreateHook = () => {
    this.props.history.push('/hooks/create');
  };

  render() {
    const {
      classes,
      user,
      onSignIn,
      onSignOut,
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
        user={user}
        onSignIn={onSignIn}
        onSignOut={onSignOut}
        search={
          <Search
            value={hookSearch}
            placeholder="Hook contains"
            onChange={this.handleHookSearchChange}
          />
        }>
        {!hookGroups && loading && <Spinner loading />}
        {error && error.graphQLErrors && <ErrorPanel error={error} />}
        {hookGroups && (
          <MuiTreeView
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
            className={classes.actionButton}>
            <PlusIcon />
          </Button>
        </Tooltip>
      </Dashboard>
    );
  }
}
