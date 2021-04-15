import { hot } from 'react-hot-loader';
import React, { Component, Fragment } from 'react';
import { graphql } from 'react-apollo';
import dotProp from 'dot-prop-immutable';
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
import artifactsQuery from './artifacts.graphql';
import indexedTaskQuery from './indexedTask.graphql';
import Link from '../../../../utils/Link';

@hot(module)
@withStyles(theme => ({
  link: {
    ...theme.mixins.link,
  },
}))
@graphql(indexedTaskQuery, {
  name: 'indexedTaskData',
  options: props => ({
    variables: {
      indexPath: `${props.match.params.namespace}.${props.match.params.namespaceTaskId}`,
    },
  }),
})
@graphql(artifactsQuery, {
  name: 'latestArtifactsData',
  options: ({ indexedTaskData }) => ({
    variables: {
      skip: !indexedTaskData.indexedTask,
      taskId: indexedTaskData.indexedTask && indexedTaskData.indexedTask.taskId,
      entryConnection: {
        limit: ARTIFACTS_PAGE_SIZE,
      },
    },
  }),
})
export default class IndexedTask extends Component {
  state = {
    indexPathInput: `${this.props.match.params.namespace}.${this.props.match.params.namespaceTaskId}`,
  };

  componentDidUpdate(prevProps) {
    if (
      'indexedTask' in this.props.indexedTaskData &&
      !('indexedTask' in prevProps.indexedTaskData)
    ) {
      this.props.latestArtifactsData.refetch({
        skip: false,
        taskId: this.props.indexedTaskData.indexedTask.taskId,
        entryConnection: {
          limit: ARTIFACTS_PAGE_SIZE,
        },
      });
    }
  }

  handleArtifactsPageChange = ({ cursor, previousCursor }) => {
    const {
      indexedTaskData: {
        indexedTask: { taskId },
      },
      latestArtifactsData: { fetchMore },
    } = this.props;

    return fetchMore({
      query: artifactsQuery,
      variables: {
        skip: false,
        taskId,
        entryConnection: {
          limit: ARTIFACTS_PAGE_SIZE,
          cursor,
          previousCursor,
        },
      },
      updateQuery(previousResult, { fetchMoreResult }) {
        const { edges, pageInfo } = fetchMoreResult.latestArtifacts;

        if (!edges.length) {
          return previousResult;
        }

        return dotProp.set(previousResult, 'latestArtifacts', artifacts =>
          dotProp.set(
            dotProp.set(artifacts, 'edges', edges),
            'pageInfo',
            pageInfo
          )
        );
      },
    });
  };

  handleIndexPathInputChange = e =>
    this.setState({ indexPathInput: e.target.value });

  handleIndexPathSearchSubmit = () => {
    this.props.history.replace(`/tasks/index/${this.state.indexPathInput}`);
  };

  render() {
    const {
      classes,
      latestArtifactsData: {
        latestArtifacts,
        task,
        error: latestArtifactsError,
        loading: latestArtifactsLoading,
      },
      indexedTaskData: {
        indexedTask,
        error: indexedTaskError,
        loading: indexedTaskLoading,
      },
      description,
    } = this.props;
    const loading = latestArtifactsLoading || indexedTaskLoading;
    const indexPaths = indexedTask?.namespace?.split('.') ?? [];

    return (
      <Dashboard
        title="Index Browser"
        helpView={<HelpView description={description} />}
        search={
          <Search
            disabled={loading}
            value={this.state.indexPathInput}
            onChange={this.handleIndexPathInputChange}
            onSubmit={this.handleIndexPathSearchSubmit}
            placeholder="Search path.to.index"
          />
        }>
        {loading && <Spinner loading />}
        {!loading && (
          <ErrorPanel fixed error={indexedTaskError || latestArtifactsError} />
        )}
        {latestArtifacts && indexedTask && task && (
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
            <br />
            <br />
            <IndexedEntry
              onArtifactsPageChange={this.handleArtifactsPageChange}
              latestArtifactsConnection={latestArtifacts}
              indexedTask={indexedTask}
              created={task.created}
            />
          </Fragment>
        )}
      </Dashboard>
    );
  }
}
