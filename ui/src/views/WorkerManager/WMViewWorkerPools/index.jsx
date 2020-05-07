import { hot } from 'react-hot-loader';
import React, { Component, Fragment } from 'react';
import { withApollo, graphql } from 'react-apollo';
import PlusIcon from 'mdi-react/PlusIcon';
import escapeStringRegexp from 'escape-string-regexp';
import dotProp from 'dot-prop-immutable';
import { withStyles } from '@material-ui/core/styles';
import Spinner from '@mozilla-frontend-infra/components/Spinner';
import Dashboard from '../../../components/Dashboard';
import workerPoolsQuery from './WMWorkerPools.graphql';
import ErrorPanel from '../../../components/ErrorPanel';
import WorkerManagerWorkerPoolsTable from '../../../components/WMWorkerPoolsTable';
import Search from '../../../components/Search';
import Button from '../../../components/Button';
import updateWorkerPoolQuery from '../WMEditWorkerPool/updateWorkerPool.graphql';
import { VIEW_WORKER_POOLS_PAGE_SIZE } from '../../../utils/constants';

@hot(module)
@withApollo
@graphql(workerPoolsQuery, {
  options: () => ({
    fetchPolicy: 'network-only', // so that it refreshes view after editing/creating
    variables: {
      connection: {
        limit: VIEW_WORKER_POOLS_PAGE_SIZE,
      },
    },
  }),
})
@withStyles(theme => ({
  createIconSpan: {
    ...theme.mixins.fab,
    ...theme.mixins.actionButton,
  },
  toolbar: {
    display: 'flex',
    justifyContent: 'flex-end',
  },
}))
export default class WorkerManagerWorkerPoolsView extends Component {
  state = {
    workerPoolSearch: '',
  };

  handleWorkerPoolSearchSubmit = async workerPoolSearch => {
    const {
      data: { refetch },
    } = this.props;

    await refetch({
      workerPoolsConnection: {
        limit: VIEW_WORKER_POOLS_PAGE_SIZE,
      },
      filter: workerPoolSearch
        ? {
            workerPoolId: {
              $regex: escapeStringRegexp(workerPoolSearch),
              $options: 'i',
            },
          }
        : null,
    });
    this.setState({ workerPoolSearch });
  };

  handleCreate = () => {
    this.props.history.push(`${this.props.match.path}/create`);
  };

  deleteRequest = async ({ workerPoolId, payload }) => {
    await this.props.client.mutate({
      mutation: updateWorkerPoolQuery,
      variables: {
        workerPoolId,
        payload: {
          ...payload,
          providerId: 'null-provider', // this is how we delete worker pools
        },
      },
      refetchQueries: ['workerPools'],
      awaitRefetchQueries: false,
    });
  };

  handlePageChange = ({ cursor, previousCursor }) => {
    const {
      data: { fetchMore },
    } = this.props;

    return fetchMore({
      query: workerPoolsQuery,
      variables: {
        connection: {
          limit: VIEW_WORKER_POOLS_PAGE_SIZE,
          cursor,
          previousCursor,
        },
        filter: this.state.workerPoolSearch
          ? {
              workerPoolId: {
                $regex: escapeStringRegexp(this.state.workerPoolSearch),
                $options: 'i',
              },
            }
          : null,
      },
      updateQuery(previousResult, { fetchMoreResult }) {
        const {
          edges,
          pageInfo,
        } = fetchMoreResult.WorkerManagerWorkerPoolSummaries;

        return dotProp.set(
          previousResult,
          'WorkerManagerWorkerPoolSummaries',
          workerPools =>
            dotProp.set(
              dotProp.set(workerPools, 'edges', edges),
              'pageInfo',
              pageInfo
            )
        );
      },
    });
  };

  render() {
    const {
      data: { loading, error, WorkerManagerWorkerPoolSummaries },
      classes,
    } = this.props;
    const { workerPoolSearch } = this.state;

    return (
      <Dashboard
        title="Worker Pools"
        search={
          <Search
            disabled={loading}
            onSubmit={this.handleWorkerPoolSearchSubmit}
            placeholder="Worker pool ID contains"
          />
        }>
        <Fragment>
          {!WorkerManagerWorkerPoolSummaries && loading && <Spinner loading />}
          <ErrorPanel fixed error={error} />
          {WorkerManagerWorkerPoolSummaries && (
            <Fragment>
              <WorkerManagerWorkerPoolsTable
                searchTerm={workerPoolSearch}
                onPageChange={this.handlePageChange}
                workerPoolsConnection={WorkerManagerWorkerPoolSummaries}
                deleteRequest={this.deleteRequest}
              />
            </Fragment>
          )}
          <Button
            spanProps={{ className: classes.createIconSpan }}
            tooltipProps={{ title: 'Create Worker Pool' }}
            requiresAuth
            color="secondary"
            variant="round"
            onClick={this.handleCreate}>
            <PlusIcon />
          </Button>
        </Fragment>
      </Dashboard>
    );
  }
}
