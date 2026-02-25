import React, { Component, Fragment } from 'react';
import dotProp from 'dot-prop-immutable';
import { withApollo, graphql } from 'react-apollo';
import TableRow from '@material-ui/core/TableRow';
import TableCell from '@material-ui/core/TableCell';
import { Typography, Box, Button, Drawer } from '@material-ui/core';
import LinkIcon from 'mdi-react/LinkIcon';
import ArchiveIcon from 'mdi-react/ArchiveIcon';
import CheckIcon from 'mdi-react/CheckIcon';
import InformationIcon from 'mdi-react/InformationOutlineIcon';
import { pipe, map, sort as rSort } from 'ramda';
import { camelCase } from 'camel-case';
import { withStyles } from '@material-ui/core/styles';
import { memoize } from '../../../utils/memoize';
import Spinner from '../../../components/Spinner';
import Dashboard from '../../../components/Dashboard';
import workerPoolQuery from './workerPool.graphql';
import ErrorPanel from '../../../components/ErrorPanel';
import Breadcrumbs from '../../../components/Breadcrumbs';
import Link from '../../../utils/Link';
import { splitWorkerPoolId } from '../../../utils/workerPool';
import WorkersNavbar from '../../../components/WorkersNavbar';
import ConnectionDataTable from '../../../components/ConnectionDataTable';
import TableCellItem from '../../../components/TableCellItem';
import DateDistance from '../../../components/DateDistance';
import { VIEW_WORKER_POOL_LAUNCH_CONFIG_PAGE_SIZE } from '../../../utils/constants';
import sort from '../../../utils/sort';
import LaunchConfigDetails from './LaunchConfigDetails';
import CopyToClipboardTableCell from '../../../components/CopyToClipboardTableCell';

const sorted = pipe(
  rSort((a, b) => sort(a.node.launchConfigId, b.node.launchConfigId)),
  map(({ node: { launchConfigId } }) => launchConfigId)
);
const getFilterStateFromQuery = query => {
  const q = new URLSearchParams(query);

  return q.get('includeArchived') === 'true';
};

const getLaunchConfigIdFromQuery = query => {
  const q = new URLSearchParams(query);

  return q.get('launchConfigId');
};

const WorkersCountCell = ({ workerPoolId, launchConfigId, count, type }) => (
  <TableCell>
    <Link
      to={`/worker-manager/${encodeURIComponent(
        workerPoolId
      )}/workers?launchConfigId=${encodeURIComponent(
        launchConfigId
      )}&state=${type}`}>
      <TableCellItem>
        {count}
        <LinkIcon size={16} style={{ marginLeft: 2 }} />
      </TableCellItem>
    </Link>
  </TableCell>
);
const DualCountCell = ({ left, right, grayedOut }) => (
  <TableCell>
    <strong style={{ marginRight: 5 }}>{left}</strong>
    &nbsp;/&nbsp;
    <strong style={{ marginLeft: 5, color: grayedOut ? 'darkgrey' : '' }}>
      {right}
    </strong>
  </TableCell>
);
const styles = theme => ({
  headline: {
    paddingLeft: theme.spacing(3),
    paddingRight: theme.spacing(3),
    textOverflow: 'ellipsis',
    overflow: 'hidden',
    maxWidth: '80vw',
    whiteSpace: 'nowrap',
  },
  metadataContainer: {
    paddingTop: theme.spacing(2),
    paddingBottom: theme.spacing(2),
    width: 400,
  },
  drawerPaper: {
    width: '50vw',
    [theme.breakpoints.down('sm')]: {
      width: '90vw',
    },
  },
  drawerCloseIcon: {
    position: 'absolute',
    top: theme.spacing(1),
    right: theme.spacing(1),
  },
  configDetails: {
    marginTop: theme.spacing(2),
    marginBottom: theme.spacing(2),
    padding: theme.spacing(2),
  },
});

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
@withStyles(styles)
export default class WMLaunchConfigs extends Component {
  state = {
    selectedLaunchConfig: null,
    sortBy: 'launchConfigId',
    sortDirection: 'asc',
  };

  /**
   * Enriches launch configurations with all necessary data in one pass
   */
  enrichLaunchConfigs = memoize(
    (
      launchConfigsConnection,
      errorsStats,
      workerPoolStats,
      workerPool,
      highlightedLaunchConfigId
    ) => {
      if (!launchConfigsConnection || !launchConfigsConnection.edges) {
        return launchConfigsConnection;
      }

      const filterIfSelected = highlightedLaunchConfigId
        ? ({ node: launchConfig }) =>
            launchConfig.launchConfigId === highlightedLaunchConfigId
        : () => true;
      // to calculate dynamic weight we need to mimic
      // what LaunchConfigSelector.forWorkerPool is doing
      // it operates on total number of errors and existing capacity
      const wpMaxCapacity = workerPool?.maxCapacity ?? 0;
      const totalWorkerPoolErrors = Object.values(
        errorsStats?.launchConfig ?? {}
      ).reduce((acc, val) => acc + val, 0);

      return {
        pageInfo: {}, // include for connection table in case no records
        ...launchConfigsConnection,
        edges: launchConfigsConnection.edges
          .filter(filterIfSelected)
          .map(edge => {
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
            const totalErrors = errorsStats?.launchConfig?.[configId] ?? 0;
            const currentNonStoppedCapacity =
              stats.requestedCapacity +
              stats.runningCapacity +
              stats.stoppingCapacity;
            const initialWeight =
              launchConfig.configuration?.initialWeight ?? 1.0;
            const effectiveMaxCapacity =
              launchConfig.configuration?.maxCapacity ?? wpMaxCapacity;
            let dynamicWeight = initialWeight;

            if (currentNonStoppedCapacity > 0 && effectiveMaxCapacity > 0) {
              dynamicWeight -= currentNonStoppedCapacity / effectiveMaxCapacity;
            }

            if (totalErrors > 0 && totalWorkerPoolErrors > 0) {
              dynamicWeight -= totalErrors / totalWorkerPoolErrors;
            }

            dynamicWeight = Math.max(0, dynamicWeight).toFixed(2);

            return {
              ...edge,
              node: {
                ...launchConfig,
                workerStats: stats,
                dynamicWeight,
                totalErrors,
                location:
                  launchConfig.configuration?.region ??
                  launchConfig.configuration?.zone ??
                  launchConfig.configuration?.location ??
                  launchConfig.configuration?.armDeployment?.parameters
                    ?.location?.value ??
                  '',
                initialWeight,
                maxCapacity: launchConfig.configuration?.maxCapacity ?? -1,
                currentCapacity: stats.currentCapacity || 0,
                currentNonStoppedCapacity,

                stats,
              },
            };
          }),
      };
    },
    {
      serializer: ([
        launchConfigsConnection,
        errorsStats,
        workerPoolStats,
        workerPool,
        highlightedLaunchConfigId,
      ]) => {
        if (!launchConfigsConnection || !launchConfigsConnection.edges) {
          return 'empty';
        }

        const ids = sorted(launchConfigsConnection.edges);

        return `${ids.join('-')}-${JSON.stringify(
          errorsStats
        )}-${JSON.stringify(workerPoolStats)}-${highlightedLaunchConfigId}-${
          workerPool?.workerPoolId
        }`;
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
          let firstValue;
          let secondValue;

          // Handle nested properties for workerStats
          if (sortBy.includes('.')) {
            const [parent, child] = sortBy.split('.');

            firstValue = a.node[parent]?.[child];
            secondValue = b.node[parent]?.[child];
          } else {
            const sortByProperty = camelCase(sortBy);

            firstValue = a.node[sortByProperty];
            secondValue = b.node[sortByProperty];
          }

          if (sortDirection === 'desc') {
            return sort(secondValue, firstValue);
          }

          return sort(firstValue, secondValue);
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

  handleDrawerClose = () => {
    this.setState({
      selectedLaunchConfig: null,
    });
  };

  handleLaunchConfigClick = launchConfig => {
    this.setState({
      selectedLaunchConfig: launchConfig,
    });
  };

  renderRow = (row, workerPoolId, includeArchived, workerPool) => {
    const { node: launchConfig } = row;
    const wpMaxCapacity = workerPool?.config?.maxCapacity ?? 'n/a';
    const launchConfigId =
      launchConfig?.launchConfigId ||
      Math.random()
        .toString(36)
        .substring(2);
    const initialWeight =
      launchConfig.configuration?.workerManager?.initialWeight ?? 1;
    const maxCapacity =
      launchConfig.configuration?.workerManager?.maxCapacity ?? -1;
    const isArchived = launchConfig?.isArchived || false;
    const rowStyle = isArchived ? { opacity: 0.5 } : {};
    const { workerStats } = launchConfig;

    return (
      <TableRow
        key={launchConfigId}
        style={rowStyle}
        hover
        onClick={() => this.handleLaunchConfigClick(launchConfig)}
        sx={{ cursor: 'pointer' }}>
        <TableCell>{launchConfig?.launchConfigId ?? 'N/A'}</TableCell>

        <DualCountCell
          left={launchConfig.dynamicWeight}
          right={initialWeight}
        />

        <DualCountCell
          left={launchConfig.currentNonStoppedCapacity}
          right={maxCapacity < 0 ? wpMaxCapacity : maxCapacity}
          grayedOut={maxCapacity < 0}
        />

        <TableCell>{launchConfig.location || 'N/A'}</TableCell>

        <WorkersCountCell
          workerPoolId={workerPoolId}
          launchConfigId={launchConfigId}
          count={workerStats.requestedCount}
          type="requested"
        />
        <WorkersCountCell
          workerPoolId={workerPoolId}
          launchConfigId={launchConfigId}
          count={workerStats.runningCount}
          type="running"
        />
        <WorkersCountCell
          workerPoolId={workerPoolId}
          launchConfigId={launchConfigId}
          count={workerStats.stoppingCount}
          type="stopping"
        />
        <WorkersCountCell
          workerPoolId={workerPoolId}
          launchConfigId={launchConfigId}
          count={workerStats.stoppedCount}
          type="stopped"
        />

        <TableCell>
          <Link
            to={`/worker-manager/${encodeURIComponent(
              workerPoolId
            )}/errors?launchConfigId=${encodeURIComponent(launchConfigId)}`}>
            <TableCellItem
              style={{
                color: launchConfig.totalErrors > 0 ? '#f44336' : '#888',
              }}>
              {launchConfig.totalErrors}
              <LinkIcon size={16} style={{ marginLeft: 4 }} />
            </TableCellItem>
          </Link>
        </TableCell>
        <CopyToClipboardTableCell
          tooltipTitle={launchConfig.created}
          textToCopy={launchConfig.created}
          text={<DateDistance from={launchConfig.created} />}
        />
        <CopyToClipboardTableCell
          tooltipTitle={launchConfig.lastModified}
          textToCopy={launchConfig.lastModified}
          text={<DateDistance from={launchConfig.lastModified} />}
        />
        <TableCell>
          <Button
            size="small"
            color="secondary"
            onClick={e => {
              e.stopPropagation();
              this.handleLaunchConfigClick(launchConfig);
            }}>
            View Details
          </Button>
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
    const { data, match, location, classes } = this.props;
    const { sortBy, sortDirection, selectedLaunchConfig } = this.state;
    const loading = !data || !data.WorkerPoolLaunchConfigs || data.loading;
    const error = data && data.error;
    const workerPoolId = decodeURIComponent(match.params.workerPoolId ?? '');
    const errorsStats = data?.WorkerManagerErrorsStats?.totals ?? {};
    const workerPoolStats = data?.WorkerPoolStats;
    const workerPool = data?.WorkerPool;
    const includeArchived = getFilterStateFromQuery(location.search);
    const highlightedLaunchConfigId = getLaunchConfigIdFromQuery(
      location.search
    );
    const headers = [
      { label: 'LaunchConfigId', id: 'launchConfigId' },
      { label: 'Weight / Initial', id: 'dynamicWeight' },
      { label: 'Capacity / Max', id: 'currentCapacity' },
      { label: 'Location', id: 'location' },
      { label: 'Requested', id: 'workerStats.requested' },
      { label: 'Running', id: 'workerStats.running' },
      { label: 'Stopping', id: 'workerStats.stopping' },
      { label: 'Stopped', id: 'workerStats.stopped' },
      { label: 'Errors', id: 'totalErrors' },
      { label: 'Created', id: 'created' },
      { label: 'Modified', id: 'lastModified' },
      { label: 'Config', id: 'config' },
    ];

    if (includeArchived) {
      headers.push({ label: 'Status', id: 'isArchived' });
    }

    const launchConfigsConnection = data?.WorkerPoolLaunchConfigs ?? {
      edges: [],
    };
    const enrichedConnection = this.enrichLaunchConfigs(
      launchConfigsConnection,
      errorsStats,
      workerPoolStats,
      workerPool,
      highlightedLaunchConfigId
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
          <Fragment>
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
                {highlightedLaunchConfigId && (
                  <Button
                    variant="outlined"
                    component={Link}
                    to={`/worker-manager/${encodeURIComponent(
                      workerPoolId
                    )}/launch-configs`}
                    style={{ marginLeft: 8 }}>
                    Show All Launch Configs
                  </Button>
                )}
                {!highlightedLaunchConfigId && (
                  <Button
                    variant="outlined"
                    component={Link}
                    to={`/worker-manager/${encodeURIComponent(
                      workerPoolId
                    )}/launch-configs?includeArchived=${!includeArchived}`}
                    style={{ marginLeft: 8 }}>
                    {includeArchived ? 'Hide Archived' : 'Include Archived'}
                  </Button>
                )}
              </Box>
              <Box mb={2} pl={1}>
                <Typography
                  variant="body2"
                  color="textSecondary"
                  style={{ display: 'flex', alignItems: 'center' }}>
                  <InformationIcon size={18} style={{ marginRight: 8 }} />
                  Note: Dynamic Weight values are calculated in real-time based
                  on the current state and may change rapidly. Therefore it is
                  an approximation, not an exact value. <br /> Max capacity is
                  taken from worker pool configuration if not defined in launch
                  config.
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
                  this.renderRow(row, workerPoolId, includeArchived, workerPool)
                }
                noItemsMessage="No launch configurations available for this worker pool."
              />
            </div>

            <Drawer
              anchor="right"
              open={Boolean(selectedLaunchConfig)}
              onClose={this.handleDrawerClose}
              classes={{ paper: classes.drawerPaper }}>
              {selectedLaunchConfig && (
                <LaunchConfigDetails
                  launchConfig={selectedLaunchConfig}
                  workerPoolId={workerPoolId}
                  includeArchived={includeArchived}
                  workerPool={workerPool}
                  classes={classes}
                />
              )}
            </Drawer>
          </Fragment>
        )}
      </Dashboard>
    );
  }
}
