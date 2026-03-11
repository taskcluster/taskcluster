import React, { Component, Fragment } from 'react';
import { graphql } from 'react-apollo';
import dotProp from 'dot-prop-immutable';
import { Typography, Box, Button } from '@material-ui/core';
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

const getLaunchConfigIdFromQuery = location => {
  const searchParams = new URLSearchParams(location.search ?? '');

  return decodeURIComponent(searchParams.get('launchConfigId') ?? '');
};

@graphql(errorsQuery, {
  options: props => ({
    variables: {
      workerPoolId: decodeURIComponent(props.match.params.workerPoolId),
      launchConfigId: getLaunchConfigIdFromQuery(props.location),
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

  handleStatClick = launchConfigId => {
    if (!launchConfigId || launchConfigId === 'unknown') {
      return;
    }

    const {
      match: {
        params: { workerPoolId },
      },
    } = this.props;

    // only launch config id is handled currently
    this.props.history.push(
      `/worker-manager/${encodeURIComponent(
        workerPoolId
      )}/launch-configs?launchConfigId=${encodeURIComponent(
        launchConfigId
      )}&includeArchived=true`
    );
  };

  render() {
    const { search } = this.state;
    const {
      data: { loading, error, WorkerManagerErrors },
      match: {
        params: { workerPoolId },
      },
      location,
    } = this.props;
    const launchConfigId = getLaunchConfigIdFromQuery(location);
    let title = `Errors for "${decodeURIComponent(workerPoolId)}"`;

    if (launchConfigId) {
      title += ` and LaunchConfigId "${decodeURIComponent(launchConfigId)}"`;
    }

    return (
      <Dashboard
        title={title}
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

        {!loading && (
          <WorkerManagerErrorsSummary
            data={this.props.data}
            selectedLaunchConfigId={launchConfigId}
            onStatClick={this.handleStatClick}
            includeLaunchConfig
          />
        )}

        {!error && !loading && (
          <Fragment>
            {launchConfigId && (
              <Box
                sx={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                }}>
                <Typography variant="subtitle1" style={{ padding: 12 }}>
                  Showing errors for Launch Config ID: &quot;
                  {decodeURIComponent(launchConfigId)}&quot;
                </Typography>
                <Button
                  variant="outlined"
                  component={Link}
                  to={`/worker-manager/${encodeURIComponent(
                    workerPoolId
                  )}/errors`}
                  style={{ marginLeft: 8 }}>
                  Show all errors
                </Button>
              </Box>
            )}
            <WorkerManagerErrorsTable
              searchTerm={search}
              workerPoolId={workerPoolId}
              onPageChange={this.handlePageChange}
              errorsConnection={WorkerManagerErrors}
            />
          </Fragment>
        )}
      </Dashboard>
    );
  }
}
