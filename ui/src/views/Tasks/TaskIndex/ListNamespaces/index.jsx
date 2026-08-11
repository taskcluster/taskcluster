import React, { Component, Fragment } from 'react';
import { Redirect } from 'react-router-dom';
import { defaultTo } from 'ramda';
import { Index } from '@taskcluster/client-web';
import { withStyles } from '@material-ui/core/styles';
import Typography from '@material-ui/core/Typography';
import Spinner from '../../../../components/Spinner';
import Dashboard from '../../../../components/Dashboard';
import HelpView from '../../../../components/HelpView';
import Search from '../../../../components/Search';
import IndexNamespacesTable from '../../../../components/IndexNamespacesTable';
import IndexTaskNamespaceTable from '../../../../components/IndexTaskNamespaceTable';
import Breadcrumbs from '../../../../components/Breadcrumbs';
import ErrorPanel from '../../../../components/ErrorPanel';
import { VIEW_NAMESPACES_PAGE_SIZE } from '../../../../utils/constants';
import Link from '../../../../utils/Link';
import { withTaskclusterClient } from '../../../../utils/TaskclusterClient';
import withPaginatedResource from '../../../../hocs/withPaginatedResource';

const defaultEmpty = defaultTo('');

@withStyles(theme => ({
  link: {
    ...theme.mixins.link,
  },
}))
@withTaskclusterClient
@withPaginatedResource({
  name: 'namespacesResource',
  fetch:
    props =>
    ({ namespace, ...options }) =>
      props
        .createTaskclusterClient({ Class: Index })
        .listNamespaces(namespace, options),
  payload: props => ({
    namespace: defaultEmpty(props.match.params.namespace),
    limit: VIEW_NAMESPACES_PAGE_SIZE,
  }),
  select: response => response.namespaces,
})
@withPaginatedResource({
  name: 'tasksResource',
  fetch:
    props =>
    ({ namespace, ...options }) =>
      props
        .createTaskclusterClient({ Class: Index })
        .listTasks(namespace, options),
  payload: props => ({
    namespace: defaultEmpty(props.match.params.namespace),
    limit: VIEW_NAMESPACES_PAGE_SIZE,
  }),
  select: response => response.tasks,
})
export default class ListNamespaces extends Component {
  state = {
    indexPathInput: defaultEmpty(this.props.match.params.namespace),
  };

  componentDidUpdate(prevProps) {
    if (
      defaultEmpty(prevProps.match.params.namespace) !==
      defaultEmpty(this.props.match.params.namespace)
    ) {
      this.setState({
        indexPathInput: defaultEmpty(this.props.match.params.namespace),
      });
    }
  }

  handleIndexPathInputChange = e => {
    this.setState({ indexPathInput: e.target.value });
  };

  handleIndexPathSearchSubmit = () => {
    this.props.history.push(`/tasks/index/${this.state.indexPathInput}`);
  };

  render() {
    const {
      classes,
      description,
      match: { params },
      namespacesResource,
      tasksResource,
    } = this.props;
    const { indexPathInput } = this.state;
    const namespaces = namespacesResource.items;
    const tasks = tasksResource.items;
    const hasNamespaces = namespaces.length > 0;
    const hasIndexedTasks = tasks.length > 0;
    const loading = namespacesResource.loading || tasksResource.loading;
    // Separates the first load, which has nothing to show yet, from paging,
    // where each table stays up and its own pagination row spins.
    const initialLoad = loading && !hasNamespaces && !hasIndexedTasks;
    const indexPaths = indexPathInput.split('.');
    const isSinglePath = indexPaths.length === 1;
    const searchTerm = params.namespace;

    return (
      <Dashboard
        title="Task Index"
        helpView={<HelpView description={description} />}
        search={
          <Search
            disabled={loading}
            value={indexPathInput}
            onChange={this.handleIndexPathInputChange}
            onSubmit={this.handleIndexPathSearchSubmit}
            placeholder="Search path.to.index"
          />
        }>
        {initialLoad && <Spinner loading />}
        <ErrorPanel
          fixed
          error={namespacesResource.error || tasksResource.error}
        />
        {!loading && !hasNamespaces && !hasIndexedTasks && !isSinglePath && (
          <Redirect
            to={`/tasks/index/${indexPathInput
              .split('.')
              .slice(0, -1)
              .join('.')}/${indexPathInput.split('.').slice(-1)[0]}`}
          />
        )}
        {!initialLoad && params.namespace && (
          <Fragment>
            <Breadcrumbs>
              <Link to="/tasks/index">
                <Typography variant="body2" className={classes.link}>
                  Indexes
                </Typography>
              </Link>
              {indexPaths.map((indexName, i) => {
                const path = indexPaths.slice(0, i + 1).join('.');

                return indexPaths.length === i + 1 ? (
                  <Typography key={path} variant="body2" color="textSecondary">
                    {indexName}
                  </Typography>
                ) : (
                  <Link key={path} to={`/tasks/index/${path}`}>
                    <Typography variant="body2" className={classes.link}>
                      {indexName}
                    </Typography>
                  </Link>
                );
              })}
            </Breadcrumbs>
            <br />
            <br />
          </Fragment>
        )}
        {!loading && !hasNamespaces && !hasIndexedTasks && isSinglePath && (
          <Typography>
            {searchTerm
              ? `No items for this page with search term ${searchTerm}.`
              : 'No items for this page.'}
          </Typography>
        )}
        {hasNamespaces && (
          <Fragment>
            <Typography variant="subtitle1">Namespaces</Typography>
            <IndexNamespacesTable
              namespaces={namespaces}
              loading={namespacesResource.loading}
              page={namespacesResource.page}
              hasNextPage={namespacesResource.hasNextPage}
              hasPreviousPage={namespacesResource.hasPreviousPage}
              onNextPage={namespacesResource.nextPage}
              onPreviousPage={namespacesResource.previousPage}
            />
          </Fragment>
        )}
        {hasIndexedTasks && (
          <Fragment>
            <Typography variant="subtitle1">Indexed Tasks</Typography>
            <IndexTaskNamespaceTable
              tasks={tasks}
              loading={tasksResource.loading}
              page={tasksResource.page}
              hasNextPage={tasksResource.hasNextPage}
              hasPreviousPage={tasksResource.hasPreviousPage}
              onNextPage={tasksResource.nextPage}
              onPreviousPage={tasksResource.previousPage}
            />
          </Fragment>
        )}
      </Dashboard>
    );
  }
}
