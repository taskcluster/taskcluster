import { hot } from 'react-hot-loader';
import { Component } from 'react';
import { graphql, compose } from 'react-apollo';
import dotProp from 'dot-prop-immutable';
import ErrorPanel from '@mozilla-frontend-infra/components/ErrorPanel';
import Spinner from '@mozilla-frontend-infra/components/Spinner';
import Dashboard from '../../../../components/Dashboard';
import IndexedEntry from '../../../../components/IndexedEntry';
import { ARTIFACTS_PAGE_SIZE } from '../../../../utils/constants';
import artifactsQuery from './artifacts.graphql';
import indexedTaskQuery from './indexedTask.graphql';

@hot(module)
@compose(
  graphql(indexedTaskQuery, {
    name: 'indexedTaskData',
    options: props => ({
      variables: {
        indexPath: `${props.match.params.namespace}.${
          props.match.params.namespaceTaskId
        }`,
      },
    }),
  }),
  graphql(artifactsQuery, {
    name: 'latestArtifactsData',
    options: ({ indexedTaskData }) => ({
      variables: {
        skip: !indexedTaskData.indexedTask,
        taskId:
          indexedTaskData.indexedTask && indexedTaskData.indexedTask.taskId,
        entryConnection: {
          limit: ARTIFACTS_PAGE_SIZE,
        },
      },
    }),
  })
)
export default class IndexedTask extends Component {
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

  render() {
    const {
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
    } = this.props;
    const loading = latestArtifactsLoading || indexedTaskLoading;

    return (
      <Dashboard title="Index Browser">
        {loading && <Spinner loading />}
        {!loading &&
          indexedTaskError &&
          indexedTaskError.graphQLErrors && (
            <ErrorPanel error={indexedTaskError} />
          )}
        {!loading &&
          latestArtifactsError &&
          latestArtifactsError.graphQLErrors && (
            <ErrorPanel error={latestArtifactsError} />
          )}
        {latestArtifacts &&
          indexedTask &&
          task && (
            <IndexedEntry
              onArtifactsPageChange={this.handleArtifactsPageChange}
              latestArtifactsConnection={latestArtifacts}
              indexedTask={indexedTask}
              created={task.created}
            />
          )}
      </Dashboard>
    );
  }
}
