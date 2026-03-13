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
import HooksListTable from '../../../components/HooksListTable';
import hooksQuery from './hooks.graphql';
import Breadcrumbs from '../../../components/Breadcrumbs';
import Link from '../../../utils/Link';

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

function ListHooks(props) {
  const { classes, description, history, match } = props;
  const { loading, error, data } = useQuery(hooksQuery, {
    fetchPolicy: 'network-only',
    variables: {
      filter: {
        hookGroupId: match.params.hookGroupId,
      },
    },
  });
  const hookGroups = data?.hookGroups;
  const { search } = parse(window.location.search.slice(1));
  const hooks = hookGroups?.map(group => group?.hooks).flat();
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

  return (
    <Dashboard
      title="Hooks"
      helpView={<HelpView description={description} />}
      search={
        <Search
          placeholder="Hook contains"
          defaultValue={search}
          onSubmit={handleHookSearchSubmit}
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
          <HooksListTable searchTerm={search} hooks={hooks} classes={classes} />
        ) : (
          <Typography variant="subtitle1">No hooks are defined</Typography>
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

export default withStyles(styles)(ListHooks);
