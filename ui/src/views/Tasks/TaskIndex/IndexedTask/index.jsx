import { hot } from 'react-hot-loader';
import React, { Component } from 'react';
import { graphql, compose } from 'react-apollo';
import dotProp from 'dot-prop-immutable';
import Spinner from '@mozilla-frontend-infra/components/Spinner';
import Dashboard from '../../../../components/Dashboard';
import HelpView from '../../../../components/HelpView';
import IndexedEntry from '../../../../components/IndexedEntry';
import { ARTIFACTS_PAGE_SIZE } from '../../../../utils/constants';
import ErrorPanel from '../../../../components/ErrorPanel';
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
      description,
    } = this.props;
    const loading = latestArtifactsLoading || indexedTaskLoading;

    return (
      <Dashboard
        title="Index Browser"
        helpView={<HelpView description={description} />}>
        {loading && <Spinner loading />}
        {!loading && <ErrorPanel error={indexedTaskError} />}
        {!loading && <ErrorPanel error={latestArtifactsError} />}
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
