import React, { Component } from 'react';
import { withRouter } from 'react-router-dom';
import { isEmpty, map, pipe, sort as rSort } from 'ramda';
import { camelCase } from 'change-case';
import memoize from 'fast-memoize';
import { formatDistanceStrict } from 'date-fns';
import { CopyToClipboard } from 'react-copy-to-clipboard';
import ContentCopyIcon from 'mdi-react/ContentCopyIcon';
import AlertIcon from 'mdi-react/AlertIcon';
import LinkIcon from 'mdi-react/LinkIcon';
import TableRow from '@material-ui/core/TableRow/TableRow';
import TableCell from '@material-ui/core/TableCell/TableCell';
import ListItemText from '@material-ui/core/ListItemText/ListItemText';
import Typography from '@material-ui/core/Typography/Typography';
import DataTable from '../DataTable';
import TableCellListItem from '../TableCellListItem';
import Link from '../../utils/Link';
import DateDistance from '../DateDistance';
import sort from '../../utils/sort';
import { WMWorkers } from '../../utils/prop-types';

@withRouter
export default class WorkerManagerWorkersTable extends Component {
  static propTypes = {
    searchTerm: String,
    workers: WMWorkers.isRequired,
  };

  state = {
    sortBy: null,
    sortDirection: null,
  };

  sortWorkers = memoize(
    (workers, sortBy, sortDirection, searchTerm) => {
      const sortByProperty = camelCase(sortBy);
      const filteredWorkers = searchTerm
        ? workers.filter(({ w }) => w.includes(searchTerm))
        : workers;

      return isEmpty(filteredWorkers)
        ? filteredWorkers
        : [...filteredWorkers].sort((a, b) => {
            const firstElement =
              sortDirection === 'desc' ? b[sortByProperty] : a[sortByProperty];
            const secondElement =
              sortDirection === 'desc' ? a[sortByProperty] : b[sortByProperty];

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

  handleHeaderClick = sortBy => {
    const toggled = this.state.sortDirection === 'desc' ? 'asc' : 'desc';
    const sortDirection = this.state.sortBy === sortBy ? toggled : 'desc';

    this.setState({ sortBy, sortDirection });
  };

  renderTableRow = worker => {
    const {
      match: { path },
    } = this.props;
    const {
      workerId,
      workerGroup,
      latestTask,
      workerAge,
      quarantineUntil,
      recentErrors,
      workerType,
    } = worker;
    const iconSize = 16;

    return (
      <TableRow key={workerId}>
        <TableCell>{workerGroup}</TableCell>

        <TableCell>
          <TableCellListItem
            button
            component={Link}
            to={`${path}/worker-types/${workerType}/workers/${workerGroup}/${workerId}`}>
            <ListItemText
              disableTypography
              primary={<Typography>{workerId}</Typography>}
            />
            <LinkIcon size={iconSize} />
          </TableCellListItem>
        </TableCell>

        <CopyToClipboard title={`${workerAge} (Copy)`} text={workerAge}>
          <TableCell>
            <TableCellListItem button>
              <ListItemText
                disableTypography
                primary={
                  <Typography>
                    <DateDistance from={workerAge} />
                  </Typography>
                }
              />
              <ContentCopyIcon size={iconSize} />
            </TableCellListItem>
          </TableCell>
        </CopyToClipboard>

        <TableCell>
          {latestTask ? (
            <TableCellListItem
              button
              component={Link}
              to={`/tasks/${latestTask.run.taskId}/runs/${
                latestTask.run.runId
              }`}>
              <ListItemText
                disableTypography
                primary={<Typography>{latestTask.run.taskId}</Typography>}
              />
              <LinkIcon size={iconSize} />
            </TableCellListItem>
          ) : (
            <Typography>n/a</Typography>
          )}
        </TableCell>

        {latestTask ? (
          <CopyToClipboard
            title={`${latestTask.run.started} (Copy)`}
            text={latestTask.run.started}>
            <TableCell>
              <TableCellListItem button>
                <ListItemText
                  disableTypography
                  primary={
                    <Typography>
                      <DateDistance from={latestTask.run.started} />
                    </Typography>
                  }
                />
                <ContentCopyIcon size={iconSize} />
              </TableCellListItem>
            </TableCell>
          </CopyToClipboard>
        ) : (
          <TableCell>
            <Typography>n/a</Typography>
          </TableCell>
        )}

        {latestTask ? (
          <CopyToClipboard
            title={`${latestTask.run.resolved} (Copy)`}
            text={latestTask.run.resolved}>
            <TableCell>
              <TableCellListItem button>
                <ListItemText
                  disableTypography
                  primary={
                    <Typography>
                      <DateDistance from={latestTask.run.resolved} />
                    </Typography>
                  }
                />
                <ContentCopyIcon size={iconSize} />
              </TableCellListItem>
            </TableCell>
          </CopyToClipboard>
        ) : (
          <TableCell>
            <Typography>n/a</Typography>
          </TableCell>
        )}

        <TableCell>
          <TableCellListItem
            button
            component={Link}
            to={`${path}/worker-types/${workerType}/workers/${workerGroup}/${workerId}/recent-errors`}>
            <ListItemText
              disableTypography
              primary={<Typography>Click to see errors</Typography>}
            />
            <AlertIcon size={iconSize} />
          </TableCellListItem>
        </TableCell>

        <TableCell>
          <TableCellListItem
            button
            component={Link}
            to={`${path}/worker-types/${workerType}/workers/${workerGroup}/${workerId}/resources`}>
            <ListItemText
              disableTypography
              primary={<Typography>{`${recentErrors}`}</Typography>}
            />
            <LinkIcon size={iconSize} />
          </TableCellListItem>
        </TableCell>

        <TableCell>
          {quarantineUntil ? (
            formatDistanceStrict(new Date(), quarantineUntil, {
              unit: 'd',
            })
          ) : (
            <Typography>n/a</Typography>
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

    return (
      <DataTable
        items={sortedWorkers}
        sortByHeader={sortBy}
        sortDirection={sortDirection}
        onHeaderClick={this.handleHeaderClick}
        renderRow={this.renderTableRow}
        headers={[
          'Worker Group',
          'Worker ID',
          'First Claim',
          'Most Recent Task',
          'Task Started',
          'Task Resolved',
          'Recent Provisioning Errors',
          'Resources',
          'Quarantined',
        ]}
        padding="dense"
      />
    );
  }
}
