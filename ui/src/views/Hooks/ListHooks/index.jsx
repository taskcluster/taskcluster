import React, { Component } from 'react';
import { graphql } from 'react-apollo';
import { withStyles } from '@material-ui/core/styles';
import ArrowDropDownIcon from '@material-ui/icons/ArrowDropDown';
import ArrowRightIcon from '@material-ui/icons/ArrowRight';
import TreeView from '@material-ui/lab/TreeView';
import TreeItem from '@material-ui/lab/TreeItem';
import PlusIcon from 'mdi-react/PlusIcon';
import { parse, stringify } from 'qs';
import Typography from '@material-ui/core/Typography';
import Spinner from '../../../components/Spinner';
import Dashboard from '../../../components/Dashboard';
import HelpView from '../../../components/HelpView';
import Search from '../../../components/Search';
import Button from '../../../components/Button';
import ErrorPanel from '../../../components/ErrorPanel';
import Link from '../../../utils/Link';
import hooksQuery from './hooks.graphql';

const TreeItems = ({ groups }) => {
  return groups
    ? groups.map(group => {
        const nodes = group.hooks.map(hook => (
          <TreeItem
            key={hook.hookId}
            nodeId={hook.hookId}
            label={
              <Link
                to={`/hooks/${group.hookGroupId}/${encodeURIComponent(
                  hook.hookId
                )}`}>
                {hook.hookId}
              </Link>
            }
          />
        ));

        return (
          <TreeItem
            key={group.hookGroupId}
            nodeId={group.hookGroupId}
            label={group.hookGroupId}>
            {nodes}
          </TreeItem>
        );
      })
    : [];
};

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
  constructor(props) {
    super(props);
    this.state = { expanded: [], selected: [] };
  }

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

  updateExpanded() {
    const query = parse(window.location.search.slice(1));
    const {
      data: { hookGroups },
    } = this.props;
    const { search } = query;
    const expandedHookGroups = hookGroups
      ? hookGroups
          .filter(
            group =>
              group.hooks.filter(hook => hook.hookId.includes(search))
                .length !== 0
          )
          .map(group => group.hookGroupId)
      : [];

    this.setState({ expanded: expandedHookGroups, selected: [] });
  }

  componentDidMount() {
    this.updateExpanded();
  }

  componentDidUpdate(prevProps) {
    if (
      prevProps.location.search.slice(1) !== this.props.location.search.slice(1)
    ) {
      this.updateExpanded();
    }
  }

  toggleState(stateName) {
    return (event, nodeIds) => this.setState({ [stateName]: nodeIds });
  }

  render() {
    const {
      classes,
      description,
      data: { loading, error, hookGroups },
    } = this.props;
    const { search } = parse(window.location.search.slice(1));
    const tree = <TreeItems groups={hookGroups} />;
    const { expanded, selected } = this.state;

    return (
      <Dashboard
        title="Hooks"
        helpView={<HelpView description={description} />}
        search={
          <Search
            placeholder="Hook contains"
            defaultValue={search}
            onSubmit={this.handleHookSearchSubmit}
          />
        }>
        {!hookGroups && loading && <Spinner loading />}
        <ErrorPanel fixed error={error} />
        {!loading &&
          (tree.length ? (
            <TreeView
              {...{ expanded, selected }}
              onNodeToggle={this.toggleState('expanded')}
              onNodeSelect={this.toggleState('selected')}
              defaultCollapseIcon={<ArrowDropDownIcon />}
              defaultExpandIcon={<ArrowRightIcon />}>
              {tree}
            </TreeView>
          ) : (
            <Typography variant="subtitle1">No hooks are defined</Typography>
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
