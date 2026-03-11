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
import HooksListTable from '../../../components/HooksListTable';
import hooksQuery from './hooks.graphql';
import Breadcrumbs from '../../../components/Breadcrumbs';
import Link from '../../../utils/Link';

@withApollo
@graphql(hooksQuery, {
  options: ({ match: { params } }) => ({
    fetchPolicy: 'network-only',
    variables: {
      filter: {
        hookGroupId: params.hookGroupId,
      },
    },
  }),
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
      match,
    } = this.props;
    const { search } = parse(window.location.search.slice(1));
    const hooks = hookGroups?.map(group => group?.hooks).flat();

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
        <div style={{ flexGrow: 1 }}>
          <Breadcrumbs>
            <Link to="/hooks">
              <Typography variant="body2">Hooks</Typography>
            </Link>
            <Typography variant="body2" color="textSecondary">
              {match.params?.hookGroupId}
            </Typography>
          </Breadcrumbs>
        </div>
        {!hookGroups && loading && <Spinner loading />}
        <ErrorPanel fixed error={error} />
        {!loading &&
          (hooks?.length ? (
            <HooksListTable
              searchTerm={search}
              hooks={hooks}
              classes={classes}
            />
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
