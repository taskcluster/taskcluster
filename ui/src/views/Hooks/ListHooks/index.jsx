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
import HooksListTable from '../../../components/HooksListTable';
import Breadcrumbs from '../../../components/Breadcrumbs';
import Link from '../../../utils/Link';
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
export default class ListHooks extends Component {
  state = {
    loading: true,
    error: null,
    hooks: null,
  };

  get hooksClient() {
    return this.props.createTaskclusterClient({ Class: Hooks });
  }

  async componentDidMount() {
    await this.fetchHooks();
  }

  fetchHooks = async () => {
    const { hookGroupId } = this.props.match.params;

    this.setState({ loading: true, error: null });

    try {
      const result = await this.hooksClient.listHooks(hookGroupId);
      const hooks = await Promise.all(
        result.hooks.map(async hook => {
          try {
            const { lastFires } = await this.hooksClient.listLastFires(
              hook.hookGroupId,
              hook.hookId,
              { limit: 1 }
            );

            return { ...hook, lastFire: lastFires[0] };
          } catch (_err) {
            // no last fires recorded for this hook yet
            return hook;
          }
        })
      );

      this.setState({ loading: false, hooks });
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
    const { classes, description, match } = this.props;
    const { loading, error, hooks } = this.state;
    const { search } = parse(window.location.search.slice(1));

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
        {!hooks && loading && <Spinner loading />}
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
          variant="circular"
          onClick={this.handleCreateHook}>
          <PlusIcon />
        </Button>
      </Dashboard>
    );
  }
}
