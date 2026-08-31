import React, { Component, Fragment } from 'react';
import { WorkerManager } from '@taskcluster/client-web';
import { Typography, Box, Button } from '@material-ui/core';
import Spinner from '../../../components/Spinner';
import Dashboard from '../../../components/Dashboard';
import ErrorPanel from '../../../components/ErrorPanel';
import { VIEW_WORKER_POOL_ERRORS_PAGE_SIZE } from '../../../utils/constants';
import WorkerManagerErrorsTable from '../../../components/WMErrorsTable';
import Search from '../../../components/Search';
import WorkerManagerErrorsSummary from '../../../components/WMErrorsSummary';
import Breadcrumbs from '../../../components/Breadcrumbs';
import Link from '../../../utils/Link';
import WorkersNavbar from '../../../components/WorkersNavbar';
import withPaginatedResource from '../../../hocs/withPaginatedResource';
import { withTaskclusterClient } from '../../../utils/TaskclusterClient';

const getLaunchConfigIdFromQuery = location => {
  const searchParams = new URLSearchParams(location.search ?? '');

  return decodeURIComponent(searchParams.get('launchConfigId') ?? '');
};

@withTaskclusterClient
@withPaginatedResource({
  fetch:
    props =>
    ({ workerPoolId, ...options }) => {
      const client = props.createTaskclusterClient({ Class: WorkerManager });

      return client.listWorkerPoolErrors(workerPoolId, options);
    },
  // Everything the request depends on lives here -- the hook refetches from
  // the first page whenever this payload changes, so a new pool or a new
  // launch config filter reloads the table.
  payload: props => {
    const launchConfigId = getLaunchConfigIdFromQuery(props.location);

    return {
      workerPoolId: decodeURIComponent(props.match.params.workerPoolId),
      limit: VIEW_WORKER_POOL_ERRORS_PAGE_SIZE,
      ...(launchConfigId ? { launchConfigId } : null),
    };
  },
  select: ({ workerPoolErrors }) => workerPoolErrors ?? [],
})
export default class WMViewErrors extends Component {
  state = {
    search: '',
    stats: null,
    statsLoading: true,
    statsError: null,
  };

  componentDidMount() {
    this.loadErrorStats();
  }

  componentDidUpdate(prevProps) {
    if (
      prevProps.match.params.workerPoolId !==
      this.props.match.params.workerPoolId
    ) {
      this.loadErrorStats();
    }
  }

  get workerManagerClient() {
    return this.props.createTaskclusterClient({ Class: WorkerManager });
  }

  loadErrorStats = async () => {
    const workerPoolId = decodeURIComponent(
      this.props.match.params.workerPoolId
    );

    this.setState({ statsLoading: true });

    try {
      const stats = await this.workerManagerClient.workerPoolErrorStats({
        workerPoolId,
      });

      this.setState({ stats, statsLoading: false, statsError: null });
    } catch (statsError) {
      this.setState({ statsLoading: false, statsError });
    }
  };

  handleSearchSubmit = search => {
    this.setState({ search });
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
    const { search, stats, statsLoading, statsError } = this.state;
    const {
      loading,
      error,
      items,
      page,
      hasNextPage,
      hasPreviousPage,
      nextPage,
      previousPage,
      match: {
        params: { workerPoolId },
      },
      location,
    } = this.props;
    const launchConfigId = getLaunchConfigIdFromQuery(location);
    const initialLoad = loading && !items.length;
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
        <ErrorPanel fixed error={error || statsError} />

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

        {initialLoad && <Spinner loading />}

        {!initialLoad && (
          <WorkerManagerErrorsSummary
            data={{ loading: statsLoading, WorkerManagerErrorsStats: stats }}
            selectedLaunchConfigId={launchConfigId}
            onStatClick={this.handleStatClick}
            includeLaunchConfig
          />
        )}

        {!error && !initialLoad && (
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
              items={items}
              page={page}
              loading={loading}
              hasNextPage={hasNextPage}
              hasPreviousPage={hasPreviousPage}
              onNextPage={nextPage}
              onPreviousPage={previousPage}
            />
          </Fragment>
        )}
      </Dashboard>
    );
  }
}
