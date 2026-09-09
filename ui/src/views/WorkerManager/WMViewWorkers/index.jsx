import React, { Component, Fragment } from 'react';
import { WorkerManager } from '@taskcluster/client-web';
import Tab from '@material-ui/core/Tab/Tab';
import Tabs from '@material-ui/core/Tabs/Tabs';
import {
  TableCell,
  TableRow,
  Tooltip,
  Typography,
  Box,
  Button,
} from '@material-ui/core';
import LinkIcon from 'mdi-react/LinkIcon';
import Spinner from '../../../components/Spinner';
import Dashboard from '../../../components/Dashboard';
import ErrorPanel from '../../../components/ErrorPanel';
import PaginatedDataTable from '../../../components/PaginatedDataTable';
import TableCellItem from '../../../components/TableCellItem';
import Link from '../../../utils/Link';
import withPaginatedResource from '../../../hocs/withPaginatedResource';
import { withTaskclusterClient } from '../../../utils/TaskclusterClient';
import { VIEW_WORKERS_PAGE_SIZE } from '../../../utils/constants';
import Label from '../../../components/Label';
import DateDistance from '../../../components/DateDistance';
import Breadcrumbs from '../../../components/Breadcrumbs';
import WorkersNavbar from '../../../components/WorkersNavbar';

const stateToLabel = {
  requested: 'default',
  running: 'success',
  stopping: 'warning',
  stopped: 'error',
  standalone: 'info',
};
const getFilterStateFromQuery = query => {
  const q = new URLSearchParams(query);

  if (q.get('state') === 'all') {
    return null;
  }

  return q.get('state');
};

const getLaunchConfigIdFromQuery = query => {
  const q = new URLSearchParams(query);

  return q.get('launchConfigId');
};

@withTaskclusterClient
@withPaginatedResource({
  fetch:
    props =>
    ({ workerPoolId, ...options }) => {
      const client = props.createTaskclusterClient({ Class: WorkerManager });

      return client.listWorkersForWorkerPool(workerPoolId, options);
    },
  // Everything the request depends on lives here, including the worker pool id
  // -- the hook refetches from the first page whenever this payload changes,
  // so a new pool or a new filter reloads the table.
  payload: props => {
    const state = getFilterStateFromQuery(props.location.search);
    const launchConfigId = getLaunchConfigIdFromQuery(props.location.search);

    return {
      workerPoolId: decodeURIComponent(props.match.params.workerPoolId),
      limit: VIEW_WORKERS_PAGE_SIZE,
      ...(state ? { state } : null),
      ...(launchConfigId ? { launchConfigId } : null),
    };
  },
  select: ({ workers }) => workers ?? [],
})
export default class WMViewWorkers extends Component {
  tabs = ['all', 'running', 'requested', 'stopping', 'stopped', 'standalone'];

  get currentTab() {
    const workerState = getFilterStateFromQuery(this.props.location.search);

    return Math.max(this.tabs.indexOf(workerState), 0);
  }

  handleTabChange = (_e, currentTab) => {
    // As before: switching tabs drops any launch config filter.
    this.props.history.push({ search: `?state=${this.tabs[currentTab]}` });
  };

  renderRow = ({
    workerPoolId,
    workerGroup,
    workerId,
    created,
    expires,
    state,
    lastModified,
    lastChecked,
    launchConfigId,
  }) => {
    const dateItem = date => (
      <Tooltip placement="top" title={date}>
        <TableCellItem>
          <DateDistance from={date} />
        </TableCellItem>
      </Tooltip>
    );
    const [provisionerId, workerType] = workerPoolId.split('/');

    return (
      <TableRow key={`${workerGroup}/${workerId}`}>
        <TableCell>{workerGroup}</TableCell>
        <TableCell>
          <Link
            to={`/provisioners/${provisionerId}/worker-types/${workerType}/workers/${workerGroup}/${workerId}`}>
            <TableCellItem button>
              {workerId}
              <LinkIcon size={16} />
            </TableCellItem>
          </Link>
        </TableCell>
        <TableCell>{dateItem(created)}</TableCell>
        <TableCell>{dateItem(expires)}</TableCell>
        <TableCell>
          <Label mini status={stateToLabel[state]}>
            {state}
          </Label>
        </TableCell>
        <TableCell>
          {launchConfigId && (
            <Link
              to={`/worker-manager/${encodeURIComponent(
                workerPoolId
              )}/launch-configs?launchConfigId=${encodeURIComponent(
                launchConfigId
              )}&includeArchived=true`}>
              <TableCellItem button>
                {launchConfigId}
                <LinkIcon size={16} />
              </TableCellItem>
            </Link>
          )}
          {!launchConfigId && <TableCellItem button>n/a</TableCellItem>}
        </TableCell>
        <TableCell>{dateItem(lastModified)}</TableCell>
        <TableCell>{dateItem(lastChecked)}</TableCell>
      </TableRow>
    );
  };

  render() {
    const {
      loading,
      error,
      items,
      page,
      hasNextPage,
      hasPreviousPage,
      nextPage,
      previousPage,
      match: { params },
      location,
    } = this.props;
    const launchConfigId = getLaunchConfigIdFromQuery(location.search);
    const state = getFilterStateFromQuery(location.search);
    const initialLoad = loading && !items.length;
    let title = `Workers for "${decodeURIComponent(params.workerPoolId)}"`;

    if (launchConfigId) {
      title += ` and Launch Config ${launchConfigId}`;
    }

    return (
      <Dashboard disableTitleFormatting title={title}>
        <ErrorPanel fixed error={error} />

        <Box
          sx={{
            display: 'flex',
            flexWrap: 'wrap',
            alignItems: 'center',
            width: '100%',
          }}>
          <div style={{ flexGrow: 1, marginRight: 8 }}>
            <Breadcrumbs>
              <Link to="/worker-manager">
                <Typography variant="body2">Worker Manager</Typography>
              </Link>
              <Link to={`/worker-manager/${params.workerPoolId}`}>
                <Typography variant="body2">
                  {decodeURIComponent(params.workerPoolId)}
                </Typography>
              </Link>
              <WorkersNavbar
                workerPoolId={decodeURIComponent(params.workerPoolId)}
                hasWorkerPool
              />
            </Breadcrumbs>
          </div>
        </Box>

        <Tabs value={this.currentTab} onChange={this.handleTabChange}>
          {this.tabs.map(tab => (
            <Tab label={tab.toUpperCase()} key={tab} />
          ))}
        </Tabs>

        {initialLoad && <Spinner loading />}

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
                  Showing workers for Launch Config ID: &quot;
                  {decodeURIComponent(launchConfigId)}&quot;
                </Typography>
                <Button
                  variant="outlined"
                  component={Link}
                  to={`/worker-manager/${encodeURIComponent(
                    params.workerPoolId
                  )}/workers?state=${state || ''}`}
                  style={{ marginLeft: 8 }}>
                  Show all workers
                </Button>
              </Box>
            )}
            <PaginatedDataTable
              noItemsMessage="No workers"
              items={items}
              pageSize={VIEW_WORKERS_PAGE_SIZE}
              renderRow={this.renderRow}
              loading={loading}
              page={page}
              hasNextPage={hasNextPage}
              hasPreviousPage={hasPreviousPage}
              onNextPage={nextPage}
              onPreviousPage={previousPage}
              headers={[
                'Worker Group',
                'Worker ID',
                'Created',
                'Expires',
                'State',
                'Launch Config',
                'Last Modified',
                'Last Checked',
              ]}
            />
          </Fragment>
        )}
      </Dashboard>
    );
  }
}
