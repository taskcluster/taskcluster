import React, { Component, Fragment } from 'react';
import { Index, Queue } from '@taskcluster/client-web';
import { withStyles } from '@material-ui/core/styles';
import Typography from '@material-ui/core/Typography';
import Spinner from '../../../../components/Spinner';
import Dashboard from '../../../../components/Dashboard';
import HelpView from '../../../../components/HelpView';
import Search from '../../../../components/Search';
import IndexedEntry from '../../../../components/IndexedEntry';
import { ARTIFACTS_PAGE_SIZE } from '../../../../utils/constants';
import ErrorPanel from '../../../../components/ErrorPanel';
import Breadcrumbs from '../../../../components/Breadcrumbs';
import Link from '../../../../utils/Link';
import { withTaskclusterClient } from '../../../../utils/TaskclusterClient';
import withPaginatedResource from '../../../../hocs/withPaginatedResource';
import withResource from '../../../../hocs/withResource';

@withStyles(theme => ({
  link: {
    ...theme.mixins.link,
  },
}))
@withTaskclusterClient
@withResource({
  name: 'indexedTaskResource',
  fetch: props => async () => {
    const index = props.createTaskclusterClient({ Class: Index });
    const queue = props.createTaskclusterClient({ Class: Queue });
    const indexed = await index.findTask(
      `${props.match.params.namespace}.${props.match.params.namespaceTaskId}`
    );
    const task = await queue.task(indexed.taskId);

    return { indexed, task };
  },
  key: props =>
    `${props.match.params.namespace}.${props.match.params.namespaceTaskId}`,
})
@withPaginatedResource({
  name: 'artifactsResource',
  fetch:
    props =>
    ({ taskId, ...options }) =>
      taskId
        ? props
            .createTaskclusterClient({ Class: Queue })
            .listLatestArtifacts(taskId, options)
        : Promise.resolve({ artifacts: [], continuationToken: null }),
  payload: props => ({
    taskId: props.indexedTaskResource.data?.indexed.taskId,
    limit: ARTIFACTS_PAGE_SIZE,
  }),
  select: response => response.artifacts,
})
export default class IndexedTask extends Component {
  state = {
    indexPathInput: `${this.props.match.params.namespace}.${this.props.match.params.namespaceTaskId}`,
  };

  componentDidUpdate(prevProps) {
    const prevPath = `${prevProps.match.params.namespace}.${prevProps.match.params.namespaceTaskId}`;
    const nextPath = `${this.props.match.params.namespace}.${this.props.match.params.namespaceTaskId}`;

    if (prevPath !== nextPath) {
      this.setState({ indexPathInput: nextPath });
    }
  }

  handleIndexPathInputChange = e =>
    this.setState({ indexPathInput: e.target.value });

  handleIndexPathSearchSubmit = () => {
    this.props.history.replace(`/tasks/index/${this.state.indexPathInput}`);
  };

  render() {
    const { classes, description, indexedTaskResource, artifactsResource } =
      this.props;
    const { indexPathInput } = this.state;
    const { data, loading, error } = indexedTaskResource;
    const indexedTask = data?.indexed ?? null;
    const task = data?.task ?? null;
    const taskId = indexedTask?.taskId;
    const initialLoad =
      loading ||
      (Boolean(taskId) &&
        artifactsResource.loading &&
        !artifactsResource.items.length);
    const indexPaths = indexedTask?.namespace?.split('.') ?? [];

    return (
      <Dashboard
        title="Index Browser"
        helpView={<HelpView description={description} />}
        search={
          <Search
            disabled={initialLoad}
            value={indexPathInput}
            onChange={this.handleIndexPathInputChange}
            onSubmit={this.handleIndexPathSearchSubmit}
            placeholder="Search path.to.index"
          />
        }>
        {initialLoad && <Spinner loading />}
        {!initialLoad && (
          <ErrorPanel fixed error={error || artifactsResource.error} />
        )}
        {!initialLoad && indexedTask && task && (
          <Fragment>
            <Breadcrumbs>
              <Link to="/tasks/index">
                <Typography variant="body2" className={classes.link}>
                  Indexes
                </Typography>
              </Link>
              {indexPaths.map((indexName, i) =>
                indexPaths.length === i + 1 ? (
                  <Typography
                    key={indexName}
                    variant="body2"
                    color="textSecondary">
                    {indexName}
                  </Typography>
                ) : (
                  <Link
                    key={indexName}
                    to={`/tasks/index/${indexPaths.slice(0, i + 1).join('.')}`}>
                    <Typography variant="body2" className={classes.link}>
                      {indexName}
                    </Typography>
                  </Link>
                )
              )}
            </Breadcrumbs>
            <IndexedEntry
              latestArtifacts={artifactsResource.items}
              artifactsLoading={artifactsResource.loading}
              page={artifactsResource.page}
              hasNextPage={artifactsResource.hasNextPage}
              hasPreviousPage={artifactsResource.hasPreviousPage}
              onNextPage={artifactsResource.nextPage}
              onPreviousPage={artifactsResource.previousPage}
              indexedTask={indexedTask}
              created={task.created}
              taskGroupId={task.taskGroupId}
            />
          </Fragment>
        )}
      </Dashboard>
    );
  }
}
