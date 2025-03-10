import React, { Component } from 'react';
import dotProp from 'dot-prop-immutable';
import { withApollo, graphql } from 'react-apollo';
import TableRow from '@material-ui/core/TableRow';
import TableCell from '@material-ui/core/TableCell';
import { Typography, Box, Button, Tooltip } from '@material-ui/core';
import LinkIcon from 'mdi-react/LinkIcon';
import ArchiveIcon from 'mdi-react/ArchiveIcon';
import CheckIcon from 'mdi-react/CheckIcon';
import InformationIcon from 'mdi-react/InformationOutlineIcon';
import { pipe, map, sort as rSort } from 'ramda';
import { camelCase } from 'camel-case';
import memoize from 'fast-memoize';
import Spinner from '../../../components/Spinner';
import Dashboard from '../../../components/Dashboard';
import workerPoolQuery from './workerPool.graphql';
import ErrorPanel from '../../../components/ErrorPanel';
import Breadcrumbs from '../../../components/Breadcrumbs';
import Link from '../../../utils/Link';
import { splitWorkerPoolId } from '../../../utils/workerPool';
import WorkersNavbar from '../../../components/WorkersNavbar';
import ConnectionDataTable from '../../../components/ConnectionDataTable';
import Code from '../../../components/Code';
import TableCellItem from '../../../components/TableCellItem';
import DateDistance from '../../../components/DateDistance';
import { VIEW_WORKER_POOL_LAUNCH_CONFIG_PAGE_SIZE } from '../../../utils/constants';
import sort from '../../../utils/sort';

const sorted = pipe(
  rSort((a, b) => sort(a.node.launchConfigId, b.node.launchConfigId)),
  map(({ node: { launchConfigId } }) => launchConfigId)
);
const getFilterStateFromQuery = query => {
  const q = new URLSearchParams(query);

  return q.get('includeArchived') === 'true';
};

const WorkerCountIndicator = ({ count }) => (
  <span style={{ fontWeight: 'bold' }}>{count}</span>
);
const Separator = () => (
  <span style={{ marginLeft: 8, marginRight: 8 }}>|</span>
);

@withApollo
@graphql(workerPoolQuery, {
  options: ({ match: { params }, location: { search } }) => ({
    fetchPolicy: 'network-only',
    variables: {
      workerPoolId: decodeURIComponent(params?.workerPoolId),
      includeArchived: getFilterStateFromQuery(search),
      connection: {
        limit: VIEW_WORKER_POOL_LAUNCH_CONFIG_PAGE_SIZE,
      },
    },
  }),
})
export default class WMLaunchConfigs extends Component {
  state = {
    expandedConfigs: {},
    sortBy: 'launchConfigId',
    sortDirection: 'asc',
  };

  /**
   * Enriches launch configurations with all necessary data in one pass
   */
  enrichLaunchConfigs = memoize(
    (launchConfigsConnection, errorsStats, workerPoolStats) => {
      if (!launchConfigsConnection || !launchConfigsConnection.edges) {
        return launchConfigsConnection;
      }

      return {
        ...launchConfigsConnection,
        edges: launchConfigsConnection.edges.map(edge => {
          const { node: launchConfig } = edge;
          const configId = launchConfig.launchConfigId;
          const stats = workerPoolStats?.launchConfigStats?.find(
            stat => stat.launchConfigId === configId
          ) || {
            currentCapacity: 0,
            requestedCapacity: 0,
            runningCapacity: 0,
            stoppingCapacity: 0,
            stoppedCapacity: 0,
            requestedCount: 0,
            runningCount: 0,
            stoppingCount: 0,
            stoppedCount: 0,
          };
          const totalWorkers =
            stats.requestedCount +
            stats.runningCount +
            stats.stoppingCount +
            stats.stoppedCount;
          // Calculate dynamic weight
          const dynamicWeight = Math.random().toFixed(2); // TODO
          const totalErrors = errorsStats?.launchConfigId?.[configId] ?? 0;
          const currentNonStoppedCapacity =
            stats.requestedCapacity +
            stats.runningCapacity +
            stats.stoppingCapacity;

          return {
            ...edge,
            node: {
              ...launchConfig,
              totalWorkers,
              workerCounts: {
                requested: stats.requestedCount || 0,
                running: stats.runningCount || 0,
                stopping: stats.stoppingCount || 0,
                stopped: stats.stoppedCount || 0,
              },
              dynamicWeight,
              totalErrors,
              location:
                launchConfig.configuration?.region ??
                launchConfig.configuration?.zone ??
                launchConfig.configuration?.location ??
                '',
              initialWeight: launchConfig.configuration?.initialWeight ?? 1.0,
              maxCapacity: launchConfig.configuration?.maxCapacity ?? -1,
              currentCapacity: stats.currentCapacity || 0,
              currentNonStoppedCapacity,
            },
          };
        }),
      };
    },
    {
      serializer: ([launchConfigsConnection, errorsStats, workerPoolStats]) => {
        if (!launchConfigsConnection || !launchConfigsConnection.edges) {
          return 'empty';
        }

        const ids = sorted(launchConfigsConnection.edges);

        return `${ids.join('-')}-${JSON.stringify(
          errorsStats
        )}-${JSON.stringify(workerPoolStats)}`;
      },
    }
  );

  /**
   * Sorts the enriched connection based on sort criteria
   */
  sortConnection = memoize(
    (enrichedConnection, sortBy, sortDirection) => {
      if (!enrichedConnection || !enrichedConnection.edges || !sortBy) {
        return enrichedConnection;
      }

      return {
        ...enrichedConnection,
        edges: [...enrichedConnection.edges].sort((a, b) => {
          const sortByProperty = camelCase(sortBy);
          const firstElement =
            sortDirection === 'desc'
              ? a.node[sortByProperty]
              : b.node[sortByProperty];
          const secondElement =
            sortDirection === 'desc'
              ? b.node[sortByProperty]
              : a.node[sortByProperty];

          return sort(firstElement, secondElement);
        }),
      };
    },
    {
      serializer: ([enrichedConnection, sortBy, sortDirection]) => {
        if (!enrichedConnection || !enrichedConnection.edges) {
          return `empty-${sortBy}-${sortDirection}`;
        }

        const ids = sorted(enrichedConnection.edges);

        return `${ids.join('-')}-${sortBy}-${sortDirection}`;
      },
    }
  );

  handleHeaderClick = header => {
    const toggled = this.state.sortDirection === 'desc' ? 'asc' : 'desc';
    const sortDirection = this.state.sortBy === header ? toggled : 'desc';

    this.setState({ sortBy: header, sortDirection });
  };

  handlePageChange = ({ cursor, previousCursor }) => {
    const {
      data: { fetchMore },
      location: { search },
      match: { params },
    } = this.props;

    return fetchMore({
      query: workerPoolQuery,
      variables: {
        connection: {
          limit: VIEW_WORKER_POOL_LAUNCH_CONFIG_PAGE_SIZE,
          cursor,
          previousCursor,
        },
        workerPoolId: decodeURIComponent(params.workerPoolId),
        includeArchived: getFilterStateFromQuery(search),
      },
      updateQuery(previousResult, { fetchMoreResult }) {
        const { edges, pageInfo } = fetchMoreResult.WorkerPoolLaunchConfigs;

        return dotProp.set(previousResult, 'WorkerPoolLaunchConfigs', wplc =>
          dotProp.set(dotProp.set(wplc, 'edges', edges), 'pageInfo', pageInfo)
        );
      },
    });
  };

  toggleExpand = configId => {
    this.setState(prevState => ({
      expandedConfigs: {
        ...prevState.expandedConfigs,
        [configId]: !prevState.expandedConfigs[configId],
      },
    }));
  };

  renderRow = (row, workerPoolId, includeArchived) => {
    const { node: launchConfig } = row;
    const launchConfiguration = launchConfig
      ? JSON.stringify(launchConfig.configuration, null, 2)
      : 'N/A';
    const configId =
      launchConfig?.launchConfigId ||
      Math.random()
        .toString(36)
        .substring(2);
    const isExpanded = this.state.expandedConfigs[configId];
    const isArchived = launchConfig?.isArchived || false;
    const rowStyle = isArchived ? { opacity: 0.5 } : {};
    const { workerCounts } = launchConfig;

    return (
      <TableRow key={configId} style={rowStyle}>
        <TableCell>{launchConfig?.launchConfigId ?? 'N/A'}</TableCell>

        <TableCell>{launchConfig.initialWeight}</TableCell>
        <TableCell>{launchConfig.dynamicWeight}</TableCell>

        <TableCell>{launchConfig.currentNonStoppedCapacity}</TableCell>
        {launchConfig.maxCapacity >= 0 && (
          <TableCell>{launchConfig.maxCapacity}</TableCell>
        )}
        {launchConfig.maxCapacity < 0 && (
          <TableCell style={{ color: 'gray' }}>not set</TableCell>
        )}

        <TableCell>{launchConfig.location || 'N/A'}</TableCell>

        {/* Enhanced Worker Count Column with Breakdown */}
        <TableCell>
          <Link
            to={`/worker-manager/${encodeURIComponent(
              workerPoolId
            )}/workers?launchConfigId=${encodeURIComponent(configId)}`}>
            <TableCellItem
              style={{
                color: launchConfig.totalWorkers > 0 ? 'inherit' : '#888',
                display: 'flex',
                flexDirection: 'column',
              }}>
              <Tooltip
                title={
                  <React.Fragment>
                    <Typography variant="body2">
                      Requested: {workerCounts.requested}
                    </Typography>
                    <Typography variant="body2">
                      Running: {workerCounts.running}
                    </Typography>
                    <Typography variant="body2">
                      Stopping: {workerCounts.stopping}
                    </Typography>
                    <Typography variant="body2">
                      Stopped: {workerCounts.stopped}
                    </Typography>
                    <Typography variant="body2">
                      Total: {launchConfig.totalWorkers}
                    </Typography>
                  </React.Fragment>
                }
                arrow>
                <div style={{ display: 'flex', alignItems: 'center' }}>
                  <WorkerCountIndicator
                    count={workerCounts.requested}
                    title="Requested workers"
                  />
                  <Separator />
                  <WorkerCountIndicator
                    count={workerCounts.running}
                    title="Running workers"
                  />
                  <Separator />
                  <WorkerCountIndicator
                    count={workerCounts.stopping}
                    title="Stopping workers"
                  />
                  <Separator />
                  <WorkerCountIndicator
                    count={workerCounts.stopped}
                    title="Stopped workers"
                  />
                  <LinkIcon size={16} style={{ marginLeft: 12 }} />
                </div>
              </Tooltip>
            </TableCellItem>
          </Link>
        </TableCell>

        <TableCell>
          <Link
            to={`/worker-manager/${encodeURIComponent(
              workerPoolId
            )}/errors?launchConfigId=${encodeURIComponent(configId)}`}>
            <TableCellItem
              style={{
                color: launchConfig.totalErrors > 0 ? '#f44336' : '#888',
              }}>
              {launchConfig.totalErrors}
              <LinkIcon size={16} style={{ marginLeft: 4 }} />
            </TableCellItem>
          </Link>
        </TableCell>
        <TableCell>
          {launchConfig?.created && (
            <DateDistance from={launchConfig.created} />
          )}
        </TableCell>
        <TableCell>
          {launchConfig?.lastModified && (
            <DateDistance from={launchConfig.lastModified} />
          )}
        </TableCell>
        <TableCell>
          {launchConfiguration !== 'N/A' &&
            (isExpanded ? (
              <div>
                <Button
                  size="small"
                  color="secondary"
                  onClick={() => this.toggleExpand(configId)}
                  style={{ marginTop: 8 }}>
                  Hide Configuration
                </Button>
                <Code language="json">{launchConfiguration}</Code>
                <Button
                  size="small"
                  color="secondary"
                  onClick={() => this.toggleExpand(configId)}
                  style={{ marginTop: 8 }}>
                  Hide Configuration
                </Button>
              </div>
            ) : (
              <Button
                size="small"
                color="secondary"
                onClick={() => this.toggleExpand(configId)}
                style={{ marginTop: 8 }}>
                Show Configuration
              </Button>
            ))}
          {launchConfiguration === 'N/A' && 'N/A'}
        </TableCell>
        {includeArchived && (
          <TableCell align="center">
            {isArchived ? (
              <ArchiveIcon
                size={20}
                style={{ color: '#bf5722' }}
                title="Archived"
              />
            ) : (
              <CheckIcon
                size={20}
                style={{ color: '#4caf50' }}
                title="Active"
              />
            )}
          </TableCell>
        )}
      </TableRow>
    );
  };

  render() {
    const { data, match, location } = this.props;
    const { sortBy, sortDirection } = this.state;
    const loading = !data || !data.WorkerPoolLaunchConfigs || data.loading;
    const error = data && data.error;
    const workerPoolId = decodeURIComponent(match.params.workerPoolId ?? '');
    const errorsStats = data?.WorkerManagerErrorsStats?.totals ?? {};
    const workerPoolStats = data?.WorkerPoolStats;
    const includeArchived = getFilterStateFromQuery(location.search);
    const headers = [
      { label: 'LaunchConfigId', id: 'launchConfigId' },
      { label: 'Iniital Weight', id: 'initialWeight' },
      { label: 'Dynamic Weight', id: 'dynamicWeight' },
      { label: 'Current Capacity', id: 'currentCapacity' },
      { label: 'Max Capacity', id: 'maxCapacity' },
      { label: 'Location', id: 'location' },
      {
        label: 'Workers (Requested | Running | Stopping | Stopped)',
        id: 'totalWorkers',
      },
      { label: 'Errors', id: 'totalErrors' },
      { label: 'Created', id: 'created' },
      { label: 'Last Modified', id: 'lastModified' },
      { label: 'Config', id: 'config' },
    ];

    if (includeArchived) {
      headers.push({ label: 'Status', id: 'isArchived' });
    }

    // Process data in a two-step pipeline:
    const launchConfigsConnection = data?.WorkerPoolLaunchConfigs ?? {
      edges: [],
    };
    const enrichedConnection = this.enrichLaunchConfigs(
      launchConfigsConnection,
      errorsStats,
      workerPoolStats
    );
    const sortedConnection = this.sortConnection(
      enrichedConnection,
      sortBy,
      sortDirection
    );

    return (
      <Dashboard
        disableTitleFormatting
        title={`Worker Pool "${workerPoolId}" Launch Configs`}>
        <Box
          marginBottom={2}
          sx={{
            display: 'flex',
            width: '100%',
            flexWrap: 'wrap',
            alignItems: 'center',
          }}>
          <div style={{ flexGrow: 1, marginRight: 8 }}>
            <Breadcrumbs style={{ flexGrow: 1, marginRight: 8 }}>
              <Link to="/worker-manager">
                <Typography variant="body2">Worker Manager</Typography>
              </Link>
              <Typography variant="body2" color="textSecondary">
                {workerPoolId}
              </Typography>
              {workerPoolId && (
                <WorkersNavbar
                  provisionerId={splitWorkerPoolId(workerPoolId).provisionerId}
                  workerType={splitWorkerPoolId(workerPoolId).workerType}
                  hasWorkerPool
                />
              )}
            </Breadcrumbs>
          </div>
        </Box>

        <ErrorPanel fixed error={error} />
        {loading && <Spinner loading />}
        {!loading && (
          <div>
            <div>
              <Box
                sx={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                }}>
                <Typography variant="h6" style={{ padding: 12 }}>
                  Launch Configs ({sortedConnection?.edges?.length ?? 0})
                </Typography>
                <Button
                  variant="outlined"
                  component={Link}
                  to={`/worker-manager/${encodeURIComponent(
                    workerPoolId
                  )}/launch-configs?includeArchived=${!includeArchived}`}
                  style={{ marginLeft: 8 }}>
                  {includeArchived ? 'Hide Archived' : 'Include Archived'}
                </Button>
              </Box>
              <Box mb={2} pl={1}>
                <Typography
                  variant="body2"
                  color="textSecondary"
                  style={{ display: 'flex', alignItems: 'center' }}>
                  <InformationIcon size={18} style={{ marginRight: 8 }} />
                  Note: Dynamic Weight values are calculated in real-time based
                  on the current state and may change rapidly.
                </Typography>
              </Box>
              <ConnectionDataTable
                connection={sortedConnection}
                pageSize={VIEW_WORKER_POOL_LAUNCH_CONFIG_PAGE_SIZE}
                headers={headers.map(header => header.label)}
                sortByHeader={sortBy}
                sortDirection={sortDirection}
                onHeaderClick={header =>
                  this.handleHeaderClick(
                    headers[headers.findIndex(h => h.label === header)].id
                  )
                }
                onPageChange={this.handlePageChange}
                renderRow={row =>
                  this.renderRow(row, workerPoolId, includeArchived)
                }
                noItemsMessage="No launch configurations available for this worker pool."
              />
            </div>
          </div>
        )}
      </Dashboard>
    );
  }
}
