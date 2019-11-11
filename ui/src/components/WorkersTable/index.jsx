import React, { Component } from 'react';
import { func, string } from 'prop-types';
import { formatDistanceStrict, parseISO } from 'date-fns';
import { pipe, map, sort as rSort } from 'ramda';
import memoize from 'fast-memoize';
import { CopyToClipboard } from 'react-copy-to-clipboard';
import TableCell from '@material-ui/core/TableCell';
import TableRow from '@material-ui/core/TableRow';
import ContentCopyIcon from 'mdi-react/ContentCopyIcon';
import { withStyles } from '@material-ui/core/styles';
import LinkIcon from 'mdi-react/LinkIcon';
import StatusLabel from '../StatusLabel';
import DateDistance from '../DateDistance';
import TableCellItem from '../TableCellItem';
import ConnectionDataTable from '../ConnectionDataTable';
import { VIEW_WORKERS_PAGE_SIZE } from '../../utils/constants';
import { workers } from '../../utils/prop-types';
import Link from '../../utils/Link';
import sort from '../../utils/sort';

const sorted = pipe(
  rSort((a, b) => sort(a.node.workerId, b.node.workerId)),
  map(
    ({ node: { workerId, latestTask } }) =>
      `${workerId}.${latestTask ? latestTask.run.taskId : '-'}.${
        latestTask ? latestTask.run.runId : '-'
      }`
  )
);

@withStyles(theme => ({
  linksIcon: {
    marginLeft: theme.spacing(1),
  },
}))
/**
 * Display relevant information about workers in a table.
 */
export default class WorkersTable extends Component {
  static propTypes = {
    /** Workers GraphQL PageConnection instance. */
    workersConnection: workers.isRequired,
    /** Callback function fired when a page is changed. */
    onPageChange: func.isRequired,
    /** Worker type name */
    workerType: string.isRequired,
    /** Provisioner identifier */
    provisionerId: string.isRequired,
  };

  state = {
    sortBy: null,
    sortDirection: null,
  };

  createSortedWorkersConnection = memoize(
    (workersConnection, sortBy, sortDirection) => {
      if (!sortBy) {
        return workersConnection;
      }

      return {
        ...workersConnection,
        edges: [...workersConnection.edges].sort((a, b) => {
          const firstElement =
            sortDirection === 'desc'
              ? this.valueFromNode(b.node)
              : this.valueFromNode(a.node);
          const secondElement =
            sortDirection === 'desc'
              ? this.valueFromNode(a.node)
              : this.valueFromNode(b.node);

          return sort(firstElement, secondElement);
        }),
      };
    },
    {
      serializer: ([workersConnections, sortBy, sortDirection]) => {
        const ids = sorted(workersConnections.edges);

        return `${ids.join('-')}-${sortBy}-${sortDirection}`;
      },
    }
  );

  handleHeaderClick = sortByHeader => {
    const sortBy = sortByHeader;
    const toggled = this.state.sortDirection === 'desc' ? 'asc' : 'desc';
    const sortDirection = this.state.sortBy === sortBy ? toggled : 'desc';

    this.setState({ sortBy, sortDirection });
  };

  valueFromNode(node) {
    const mapping = {
      'Worker Group': node.workerGroup,
      'Worker ID': node.workerId,
      'First Claim': node.firstClaim,
      'Most Recent Task': node.latestTask && node.latestTask.run.taskId,
      'Task State': node.latestTask && node.latestTask.run.state,
      'Task Started': node.latestTask && node.latestTask.run.started,
      'Task Resolved': node.latestTask && node.latestTask.run.resolved,
      Quarantined: node.quarantineUntil,
    };

    return mapping[this.state.sortBy];
  }

  render() {
    const { sortBy, sortDirection } = this.state;
    const {
      provisionerId,
      workerType,
      onPageChange,
      workersConnection,
      classes,
      ...props
    } = this.props;
    const iconSize = 16;
    const connection = this.createSortedWorkersConnection(
      workersConnection,
      sortBy,
      sortDirection
    );

    return (
      <ConnectionDataTable
        connection={connection}
        pageSize={VIEW_WORKERS_PAGE_SIZE}
        sortByHeader={sortBy}
        sortDirection={sortDirection}
        onHeaderClick={this.handleHeaderClick}
        onPageChange={onPageChange}
        renderRow={({
          node: {
            workerId,
            workerGroup,
            latestTask,
            firstClaim,
            quarantineUntil,
          },
        }) => (
          <TableRow key={workerId}>
            <TableCell>{workerGroup}</TableCell>
            <TableCell>
              <Link
                to={`/provisioners/${provisionerId}/worker-types/${workerType}/workers/${workerGroup}/${workerId}`}>
                <TableCellItem button>
                  {workerId}
                  <LinkIcon className={classes.linksIcon} size={iconSize} />
                </TableCellItem>
              </Link>
            </TableCell>
            <CopyToClipboard title={`${firstClaim} (Copy)`} text={firstClaim}>
              <TableCell>
                <TableCellItem button>
                  <DateDistance from={firstClaim} />
                  <ContentCopyIcon
                    className={classes.linksIcon}
                    size={iconSize}
                  />
                </TableCellItem>
              </TableCell>
            </CopyToClipboard>
            <TableCell>
              {latestTask ? (
                <Link
                  to={`/tasks/${latestTask.run.taskId}/runs/${latestTask.run.runId}`}>
                  <TableCellItem button>
                    {latestTask.run.taskId}
                    <LinkIcon className={classes.linksIcon} size={iconSize} />
                  </TableCellItem>
                </Link>
              ) : (
                <em>n/a</em>
              )}
            </TableCell>
            <TableCell>
              {latestTask ? (
                <StatusLabel state={latestTask.run.state} />
              ) : (
                <em>n/a</em>
              )}
            </TableCell>
            {latestTask ? (
              <CopyToClipboard
                title={`${latestTask.run.started} (Copy)`}
                text={latestTask.run.started}>
                <TableCell>
                  <TableCellItem button>
                    <DateDistance from={latestTask.run.started} />
                    <ContentCopyIcon
                      className={classes.linksIcon}
                      size={iconSize}
                    />
                  </TableCellItem>
                </TableCell>
              </CopyToClipboard>
            ) : (
              <TableCell>n/a</TableCell>
            )}
            {latestTask && latestTask.run.resolved ? (
              <CopyToClipboard
                title={`${latestTask.run.resolved} (Copy)`}
                text={latestTask.run.resolved}>
                <TableCell>
                  <TableCellItem button>
                    <DateDistance from={latestTask.run.resolved} />
                    <ContentCopyIcon
                      className={classes.linksIcon}
                      size={iconSize}
                    />
                  </TableCellItem>
                </TableCell>
              </CopyToClipboard>
            ) : (
              <TableCell>n/a</TableCell>
            )}
            <TableCell>
              {quarantineUntil ? (
                formatDistanceStrict(new Date(), parseISO(quarantineUntil), {
                  unit: 'day',
                })
              ) : (
                <em>n/a</em>
              )}
            </TableCell>
          </TableRow>
        )}
        headers={[
          'Worker Group',
          'Worker ID',
          'First Claim',
          'Most Recent Task',
          'Task State',
          'Task Started',
          'Task Resolved',
          'Quarantined',
        ]}
        {...props}
      />
    );
  }
}
