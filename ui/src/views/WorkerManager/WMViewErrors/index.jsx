import React, { Component } from 'react';
import { graphql } from 'react-apollo';
import dotProp from 'dot-prop-immutable';
import { Typography } from '@material-ui/core';
import Spinner from '../../../components/Spinner';
import Dashboard from '../../../components/Dashboard';
import ErrorPanel from '../../../components/ErrorPanel';
import { VIEW_WORKER_POOL_ERRORS_PAGE_SIZE } from '../../../utils/constants';
import WorkerManagerErrorsTable from '../../../components/WMErrorsTable';
import errorsQuery from './errors.graphql';
import Search from '../../../components/Search';
import WorkerManagerErrorsSummary from '../../../components/WMErrorsSummary';
import Breadcrumbs from '../../../components/Breadcrumbs';
import Link from '../../../utils/Link';
import WorkersNavbar from '../../../components/WorkersNavbar';

@graphql(errorsQuery, {
  options: props => ({
    variables: {
      workerPoolId: decodeURIComponent(props.match.params.workerPoolId),
      errorsConnection: {
        limit: VIEW_WORKER_POOL_ERRORS_PAGE_SIZE,
      },
    },
  }),
})
export default class WMViewErrors extends Component {
  state = {
    search: '',
  };

  handleSearchSubmit = search => {
    this.setState({ search });
  };

  handlePageChange = ({ cursor, previousCursor }) => {
    const {
      match: {
        params: { workerPoolId },
      },
      data: { fetchMore },
    } = this.props;

    return fetchMore({
      query: errorsQuery,
      variables: {
        workerPoolId: decodeURIComponent(workerPoolId),
        errorsConnection: {
          limit: VIEW_WORKER_POOL_ERRORS_PAGE_SIZE,
          cursor,
          previousCursor,
        },
      },
      updateQuery(
        previousResult,
        { fetchMoreResult: { WorkerManagerErrors } }
      ) {
        // use dotProp.set to avoid lint warning about assigning to properties
        return dotProp.set(
          previousResult,
          'WorkerManagerErrors',
          WorkerManagerErrors
        );
      },
    });
  };

  render() {
    const { search } = this.state;
    const {
      data: { loading, error, WorkerManagerErrors },
      match: {
        params: { workerPoolId },
      },
    } = this.props;

    return (
      <Dashboard
        title={`Errors for "${decodeURIComponent(workerPoolId)}"`}
        disableTitleFormatting
        search={
          <Search
            disabled={loading}
            onSubmit={this.handleSearchSubmit}
            placeholder="Title, description, or error ID"
          />
        }>
        <ErrorPanel fixed error={error} />

        <div style={{ flexGrow: 1, marginRight: 8 }}>
          <Breadcrumbs>
            <Link to="/worker-manager">
              <Typography variant="body2">Worker Manager</Typography>
            </Link>
            <Link to={`/worker-manager/${workerPoolId}`}>
              <Typography variant="body2">
                {decodeURIComponent(workerPoolId)}
              </Typography>
            </Link>

            <WorkersNavbar
              workerPoolId={decodeURIComponent(workerPoolId)}
              hasWorkerPool
            />
          </Breadcrumbs>
        </div>

        {loading && <Spinner loading />}

        {!loading && <WorkerManagerErrorsSummary data={this.props.data} />}

        {!error && !loading && (
          <WorkerManagerErrorsTable
            searchTerm={search}
            onPageChange={this.handlePageChange}
            errorsConnection={WorkerManagerErrors}
          />
        )}
      </Dashboard>
    );
  }
}
