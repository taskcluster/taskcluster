import React, { Component } from 'react';
import dotProp from 'dot-prop-immutable';
import { withApollo, graphql } from 'react-apollo';
import TableRow from '@material-ui/core/TableRow';
import TableCell from '@material-ui/core/TableCell';
import { Typography, Box, Button } from '@material-ui/core';
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

  if (q.get('includeArchived') === 'true') {
    return true;
  }

  return false;
};

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

  createSortedConnection = memoize(
    (launchConfigsConnection, sortBy, sortDirection, errorsStats) => {
      if (!launchConfigsConnection || !launchConfigsConnection.edges) {
        return launchConfigsConnection;
      }

      if (!sortBy) {
        return launchConfigsConnection;
      }

      const getSortValue = (node, property) => {
        if (property === 'initialWeight') {
          return node.configuration?.initialWeight ?? 1.0;
        }

        if (property === 'maxCapacity') {
          return node.configuration?.maxCapacity ?? 0;
        }

        if (property === 'location') {
          return (
            node.configuration?.region ??
            node.configuration?.zone ??
            node.configuration?.location ??
            ''
          );
        }

        if (property === 'isActive') {
          return String(!!node.isActive);
        }

        if (property === 'totalErrors') {
          return errorsStats?.launchConfigId?.[node.launchConfigId] ?? 0;
        }

        if (property === 'totalWorkers') {
          return node.totalWorkers ?? 0;
        }

        if (property === 'dynamicWeight') {
          return node.dynamicWeight ?? 0;
        }

        return node[property];
      };

      return {
        ...launchConfigsConnection,
        edges: [...launchConfigsConnection.edges].sort((a, b) => {
          const sortByProperty = camelCase(sortBy);
          const firstElement =
            sortDirection === 'desc'
              ? getSortValue(b.node, sortByProperty)
              : getSortValue(a.node, sortByProperty);
          const secondElement =
            sortDirection === 'desc'
              ? getSortValue(a.node, sortByProperty)
              : getSortValue(b.node, sortByProperty);

          return sort(firstElement, secondElement);
        }),
      };
    },
    {
      serializer: ([
        launchConfigsConnection,
        sortBy,
        sortDirection,
        errorsStats,
        workerPoolStats,
      ]) => {
        if (!launchConfigsConnection || !launchConfigsConnection.edges) {
          return `empty-${sortBy}-${sortDirection}`;
        }

        const ids = sorted(launchConfigsConnection.edges);

        return `${ids.join('-')}-${sortBy}-${sortDirection}-${JSON.stringify(
          errorsStats
        )}-${JSON.stringify(workerPoolStats)}`;
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

  calculateDynamicWeight(launchConfig, workerPoolStats) {
    const stats = workerPoolStats?.launchConfigStats?.find(
      stat => stat.launchConfigId === launchConfig.launchConfigId
    );

    if (!stats || launchConfig.isArchived) {
      return 0;
    }

    const maxCapacity = launchConfig.configuration?.maxCapacity || 1;
    const currentCapacity = stats.currentCapacity || 0;
    const initialWeight = launchConfig.configuration?.initialWeight || 1.0;
    const capacityRatio = 1 - currentCapacity / maxCapacity;
    const dynamicWeight = initialWeight * capacityRatio;

    return Number(dynamicWeight.toFixed(2));
  }

  renderRow(
    { node: launchConfig },
    workerPoolId,
    errorsStats,
    includeArchived,
    workerPoolStats
  ) {
    const launchConfiguration = launchConfig
      ? JSON.stringify(launchConfig.configuration, null, 2)
      : 'N/A';
    const configId =
      launchConfig?.launchConfigId ||
      Math.random()
        .toString(36)
        .substring(2);
    const isExpanded = this.state.expandedConfigs[configId];
    const totalErrors = errorsStats?.launchConfigId?.[configId] ?? 0;
    // Get worker stats for this launch config
    const stats = workerPoolStats?.launchConfigStats?.find(
      stat => stat.launchConfigId === configId
    );
    // Calculate total workers based on actual data
    const totalWorkers = stats
      ? stats.requestedCount + stats.runningCount + stats.stoppingCount
      : 0;
    const maxCapacity = launchConfig?.configuration?.maxCapacity ?? `-`;
    const initialWeight = launchConfig?.configuration?.initialWeight ?? 1.0;
    const location =
      launchConfig?.configuration?.region ??
      launchConfig?.configuration?.zone ??
      launchConfig?.configuration?.location ??
      'N/A';
    const isArchived = launchConfig?.isArchived || false;
    const rowStyle = isArchived ? { opacity: 0.5 } : {};
    // Use the calculated dynamic weight
    const dynamicWeight = this.calculateDynamicWeight(
      launchConfig,
      workerPoolStats
    );

    return (
      <TableRow key={configId} style={rowStyle}>
        <TableCell>{launchConfig?.launchConfigId ?? 'N/A'}</TableCell>
        <TableCell>{initialWeight}</TableCell>
        <TableCell>{dynamicWeight}</TableCell>
        <TableCell>{maxCapacity}</TableCell>
        <TableCell>{location}</TableCell>
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
                  Hide Full Configuration
                </Button>
                <Code language="json">{launchConfiguration}</Code>
                <Button
                  size="small"
                  color="secondary"
                  onClick={() => this.toggleExpand(configId)}
                  style={{ marginTop: 8 }}>
                  Hide Full Configuration
                </Button>
              </div>
            ) : (
              <Button
                size="small"
                color="secondary"
                onClick={() => this.toggleExpand(configId)}
                style={{ marginTop: 8 }}>
                Show Full Configuration
              </Button>
            ))}
          {launchConfiguration === 'N/A' && 'N/A'}
        </TableCell>
        <TableCell>
          <Link
            to={`/worker-manager/${encodeURIComponent(
              workerPoolId
            )}/workers?launchConfigId=${encodeURIComponent(configId)}`}>
            <TableCellItem
              style={{
                color: totalWorkers > 0 ? 'inherit' : '#888',
              }}>
              {totalWorkers}
              <LinkIcon />
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
                color: totalErrors > 0 ? '#f44336' : '#888',
              }}>
              {totalErrors}
              <LinkIcon />
            </TableCellItem>
          </Link>
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
  }

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
      { label: 'Initial Weight', id: 'initialWeight' },
      { label: 'Dynamic Weight', id: 'dynamicWeight' },
      { label: 'Max Capacity', id: 'maxCapacity' },
      { label: 'Location', id: 'location' },
      { label: 'Created', id: 'created' },
      { label: 'Last Modified', id: 'lastModified' },
      { label: 'Config', id: 'config' },
      { label: 'Total Workers', id: 'totalWorkers' },
      { label: 'Total Errors', id: 'totalErrors' },
    ];
    const launchConfigsConnection = data?.WorkerPoolLaunchConfigs ?? {
      edges: [],
    };
    const enrichedLaunchConfigsConnection = {
      ...launchConfigsConnection,
      edges: launchConfigsConnection.edges.map(edge => {
        const stats = workerPoolStats?.launchConfigStats?.find(
          stat => stat.launchConfigId === edge.node.launchConfigId
        );
        const totalWorkers = stats
          ? stats.requestedCount + stats.runningCount + stats.stoppingCount
          : 0;
        const dynamicWeight = this.calculateDynamicWeight(
          edge.node,
          workerPoolStats
        );

        return {
          ...edge,
          node: {
            ...edge.node,
            totalWorkers,
            dynamicWeight,
            totalErrors:
              errorsStats?.launchConfigId?.[edge.node.launchConfigId] ?? 0,
          },
        };
      }),
    };
    const sortedLaunchConfigsConnection = this.createSortedConnection(
      enrichedLaunchConfigsConnection,
      sortBy,
      sortDirection,
      errorsStats,
      workerPoolStats
    );

    if (includeArchived) {
      headers.push({ label: 'Is Active', id: 'isArchived' });
    }

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
                  Launch Configs (
                  {sortedLaunchConfigsConnection?.edges?.length ?? 0})
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
                connection={sortedLaunchConfigsConnection}
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
                  this.renderRow(
                    row,
                    workerPoolId,
                    errorsStats,
                    includeArchived,
                    workerPoolStats
                  )
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
