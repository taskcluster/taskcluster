import React, { Component } from 'react';
import { withRouter } from 'react-router-dom';
import { isEmpty, map, pipe, sort as rSort } from 'ramda';
import memoize from 'fast-memoize';
import { formatDistanceStrict } from 'date-fns';
import { arrayOf } from 'prop-types';
import AlertIcon from 'mdi-react/AlertIcon';
import LinkIcon from 'mdi-react/LinkIcon';
import TableRow from '@material-ui/core/TableRow';
import TableCell from '@material-ui/core/TableCell';
import CopyToClipboardTableCell from '../CopyToClipboardTableCell';
import DataTable from '../DataTable';
import TableCellItem from '../TableCellItem';
import Link from '../../utils/Link';
import DateDistance from '../DateDistance';
import sort from '../../utils/sort';
import { WMWorker } from '../../utils/prop-types';

@withRouter
export default class WorkerManagerWorkersTable extends Component {
  static propTypes = {
    searchTerm: String,
    workers: arrayOf(WMWorker).isRequired,
  };

  static defaultProps = {
    searchTerm: '',
  };

  state = {
    sortBy: null,
    sortDirection: null,
  };

  sortWorkers = memoize(
    (workers, sortBy, sortDirection, searchTerm) => {
      const filteredWorkers = searchTerm
        ? workers.filter(({ w }) => w.includes(searchTerm))
        : workers;

      return isEmpty(filteredWorkers)
        ? filteredWorkers
        : [...filteredWorkers].sort((a, b) => {
            const firstElement =
              sortDirection === 'desc' ? b[sortBy] : a[sortBy];
            const secondElement =
              sortDirection === 'desc' ? a[sortBy] : b[sortBy];

            return sort(firstElement, secondElement);
          });
    },
    {
      serializer: ([workers, sortBy, sortDirection, searchTerm]) => {
        const ids = pipe(
          rSort((a, b) => sort(a.worker, b.worker)),
          map(({ worker }) => worker)
        )(workers);

        return `${ids.join('-')}-${sortBy}-${sortDirection}-${searchTerm}`;
      },
    }
  );

  handleHeaderClick = header => {
    const toggled = this.state.sortDirection === 'desc' ? 'asc' : 'desc';
    const sortDirection = this.state.sortBy === header.id ? toggled : 'desc';

    this.setState({ sortBy: header.id, sortDirection });
  };

  renderTableRow = worker => {
    const {
      match: { path },
    } = this.props;
    const {
      workerId,
      workerGroup,
      latestTaskRun,
      workerAge,
      quarantineUntil,
      recentErrors,
      workerPool,
    } = worker;
    const iconSize = 16;

    return (
      <TableRow key={workerId}>
        <TableCell>{workerGroup}</TableCell>

        <TableCell>
          <Link to={`${path}/tasks`}>
            <TableCellItem button>
              {workerId}
              <LinkIcon size={iconSize} />
            </TableCellItem>
          </Link>
        </TableCell>

        <CopyToClipboardTableCell
          tooltipTitle={workerAge}
          textToCopy={workerAge}
          text={<DateDistance from={workerAge} />}
        />
        <TableCell>
          {latestTaskRun ? (
            <Link
              to={`/tasks/${latestTaskRun.taskId}/runs/${latestTaskRun.runId}`}>
              <TableCellItem button>
                {latestTaskRun.taskId}
                <LinkIcon size={iconSize} />
              </TableCellItem>
            </Link>
          ) : (
            <em>n/a</em>
          )}
        </TableCell>

        {latestTaskRun ? (
          <CopyToClipboardTableCell
            tooltipTitle={latestTaskRun.started}
            textToCopy={latestTaskRun.started}
            text={<DateDistance from={latestTaskRun.started} />}
          />
        ) : (
          <TableCell>n/a</TableCell>
        )}

        {latestTaskRun ? (
          <CopyToClipboardTableCell
            tooltipTitle={latestTaskRun.resolved}
            textToCopy={latestTaskRun.resolved}
            text={<DateDistance from={latestTaskRun.resolved} />}
          />
        ) : (
          <TableCell>n/a</TableCell>
        )}

        <TableCell>
          <Link to={`${path}/errors`}>
            <TableCellItem button>
              Click to see errors
              <AlertIcon size={iconSize} />
            </TableCellItem>
          </Link>
        </TableCell>

        <TableCell>
          <Link
            to={`${path}/worker-types/${workerPool}/workers/${workerGroup}/${workerId}/resources`}>
            <TableCellItem button>
              {`${recentErrors}`}
              <LinkIcon size={iconSize} />
            </TableCellItem>
          </Link>
        </TableCell>

        <TableCell>
          {quarantineUntil ? (
            formatDistanceStrict(new Date(), quarantineUntil, {
              unit: 'day',
            })
          ) : (
            <em>n/a</em>
          )}
        </TableCell>
      </TableRow>
    );
  };

  render() {
    const { workers, searchTerm } = this.props;
    const { sortBy, sortDirection } = this.state;
    const sortedWorkers = this.sortWorkers(
      workers,
      sortBy,
      sortDirection,
      searchTerm
    );
    const headers = [
      { label: 'Worker Group', id: 'workerGroup', type: 'string' },
      {
        label: 'Worker ID',
        id: 'workerId',
        type: 'number',
      },
      {
        label: 'First Claim',
        id: 'firstClaim',
        type: 'string',
      },
      {
        label: 'Most Recent Task',
        id: 'mostRecentTask',
        type: 'string',
      },

      {
        label: 'Task Started',
        id: 'taskStarted',
        type: 'string',
      },
      {
        label: 'Task Resolved',
        id: 'taskResolved',
        type: 'string',
      },
      {
        label: 'Recent Provisioning Errors',
        id: 'recentProvisioningErrors',
        type: 'string',
      },
      {
        label: 'Resources',
        id: 'resources',
        type: 'string',
      },
      {
        label: 'Quarantined',
        id: 'quarantined',
        type: 'string',
      },
    ];

    return (
      <DataTable
        items={sortedWorkers}
        sortByLabel={sortBy}
        sortDirection={sortDirection}
        onHeaderClick={this.handleHeaderClick}
        renderRow={this.renderTableRow}
        headers={headers}
      />
    );
  }
}
