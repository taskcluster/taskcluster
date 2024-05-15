import React, { Component } from 'react';
import { graphql } from 'react-apollo';
import { withRouter } from 'react-router-dom';
import dotProp from 'dot-prop-immutable';
import Tab from '@material-ui/core/Tab/Tab';
import Tabs from '@material-ui/core/Tabs/Tabs';
import { TableCell, TableRow, Tooltip, Typography } from '@material-ui/core';
import LinkIcon from 'mdi-react/LinkIcon';
import Spinner from '../../../components/Spinner';
import Dashboard from '../../../components/Dashboard';
import ErrorPanel from '../../../components/ErrorPanel';
import workersQuery from './WMWorkers.graphql';
import ConnectionDataTable from '../../../components/ConnectionDataTable';
import TableCellItem from '../../../components/TableCellItem';
import Link from '../../../utils/Link';
import { VIEW_WORKERS_PAGE_SIZE } from '../../../utils/constants';
import Label from '../../../components/Label';
import DateDistance from '../../../components/DateDistance';
import Breadcrumbs from '../../../components/Breadcrumbs';

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

@withRouter
@graphql(workersQuery, {
  options: props => ({
    variables: {
      workerPoolId: decodeURIComponent(props.match.params.workerPoolId),
      state: getFilterStateFromQuery(props.location.search),
      workersConnection: {
        limit: VIEW_WORKERS_PAGE_SIZE,
      },
    },
  }),
})
export default class WMViewWorkers extends Component {
  constructor(props) {
    super(props);

    const workerState = getFilterStateFromQuery(props.location.search);

    this.state = {
      currentTab: Math.max(this.tabs.indexOf(workerState), 0),
    };
  }

  tabs = ['all', 'running', 'requested', 'stopping', 'stopped', 'standalone'];

  handleTabChange = (e, currentTab) => {
    this.setState({ currentTab });
    const searchState = this.tabs[currentTab];

    this.props.history.push({
      search: `?state=${searchState}`,
    });

    this.props.data.refetch({
      workerPoolId: decodeURIComponent(this.props.match.params.workerPoolId),
      state: searchState !== 'all' ? searchState : null,
    });
  };

  handlePageChange = ({ cursor, previousCursor }) => {
    const {
      match: {
        params: { workerPoolId },
      },
      data: { fetchMore },
    } = this.props;

    return fetchMore({
      query: workersQuery,
      variables: {
        workerPoolId: decodeURIComponent(workerPoolId),
        state: getFilterStateFromQuery(this.props.location.search),
        workersConnection: {
          limit: VIEW_WORKERS_PAGE_SIZE,
          cursor,
          previousCursor,
        },
      },
      updateQuery(previousResult, { fetchMoreResult }) {
        const { edges, pageInfo } = fetchMoreResult.WorkerManagerWorkers;

        if (!edges.length) {
          return previousResult;
        }

        return dotProp.set(
          previousResult,
          'WorkerManagerWorkers',
          WorkerManagerWorkers =>
            dotProp.set(
              dotProp.set(WorkerManagerWorkers, 'edges', edges),
              'pageInfo',
              pageInfo
            )
        );
      },
    });
  };

  renderRow({
    node: {
      workerPoolId,
      workerGroup,
      workerId,
      created,
      expires,
      state,
      lastModified,
      lastChecked,
    },
  }) {
    const dateItem = date => (
      <Tooltip placement="top" title={new Date(date).toLocaleString()}>
        <TableCellItem>
          <DateDistance from={new Date(date)} />
        </TableCellItem>
      </Tooltip>
    );
    const [provisionerId, workerType] = workerPoolId.split('/');

    return (
      <TableRow key={workerId}>
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
        <TableCell>{dateItem(lastModified)}</TableCell>
        <TableCell>{dateItem(lastChecked)}</TableCell>
      </TableRow>
    );
  }

  render() {
    const { currentTab } = this.state;
    const {
      data: { loading, error, WorkerManagerWorkers },
      match: { params },
    } = this.props;

    return (
      <Dashboard
        disableTitleFormatting
        title={`Workers for "${decodeURIComponent(params.workerPoolId)}"`}>
        <ErrorPanel fixed error={this.state.error || error} />

        <div>
          <Breadcrumbs>
            <Link to="/worker-manager">
              <Typography variant="body2">Worker Manager</Typography>
            </Link>
            <Link to={`/worker-manager/${params.workerPoolId}`}>
              <Typography variant="body2">
                {decodeURIComponent(params.workerPoolId)}
              </Typography>
            </Link>
            <Typography variant="body2" color="textSecondary">
              Workers
            </Typography>
          </Breadcrumbs>
        </div>

        <Tabs value={currentTab} onChange={this.handleTabChange}>
          {this.tabs.map(tab => (
            <Tab label={tab.toUpperCase()} key={tab} />
          ))}
        </Tabs>

        {loading && <Spinner loading />}

        {!error && !loading && (
          <ConnectionDataTable
            noItemsMessage="No workers"
            connection={WorkerManagerWorkers}
            pageSize={VIEW_WORKERS_PAGE_SIZE}
            renderRow={this.renderRow}
            onPageChange={this.handlePageChange}
            headers={[
              'Worker Group',
              'Worker ID',
              'Created',
              'Expires',
              'State',
              'Last Modified',
              'Last Checked',
            ]}
          />
        )}
      </Dashboard>
    );
  }
}
