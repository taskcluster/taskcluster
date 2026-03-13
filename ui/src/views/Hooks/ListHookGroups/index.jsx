import React from 'react';
import { useQuery } from '@apollo/client';
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

const styles = theme => ({
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
});

function ListHookGroups(props) {
  const { classes, description, history } = props;
  const { loading, error, data } = useQuery(hookGroupsQuery, {
    fetchPolicy: 'network-only',
  });
  const hookGroups = data?.hookGroups;
  const handleCreateHook = () => {
    history.push('/hooks/create');
  };

  const handleHookSearchSubmit = hookSearch => {
    const query = parse(window.location.search.slice(1));

    history.push({
      search: stringify({
        ...query,
        search: hookSearch,
      }),
    });
  };

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
          onSubmit={handleHookSearchSubmit}
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
        onClick={handleCreateHook}>
        <PlusIcon />
      </Button>
    </Dashboard>
  );
}

export default withStyles(styles)(ListHookGroups);
