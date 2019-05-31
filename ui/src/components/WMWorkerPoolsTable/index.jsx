import React, { Component } from 'react';
import { arrayOf, string } from 'prop-types';
import TableRow from '@material-ui/core/TableRow';
import TableCell from '@material-ui/core/TableCell';
import Typography from '@material-ui/core/Typography/';
import ListItemText from '@material-ui/core/ListItemText/ListItemText';
import LinkIcon from 'mdi-react/LinkIcon';
import ContentCopyIcon from 'mdi-react/ContentCopyIcon';
import { CopyToClipboard } from 'react-copy-to-clipboard';
import { withRouter } from 'react-router-dom';
import memoize from 'fast-memoize';
import { camelCase } from 'change-case';
import { isEmpty, map, pipe, sort as rSort } from 'ramda';
import { WorkerManagerWorkerPoolSummary } from '../../utils/prop-types';
import DataTable from '../DataTable';
import sort from '../../utils/sort';
import Link from '../../utils/Link';
import DateDistance from '../DateDistance';
import TableCellListItem from '../TableCellListItem';

@withRouter
export default class WorkerManagerWorkerPoolsTable extends Component {
  static propTypes = {
    workerPools: arrayOf(WorkerManagerWorkerPoolSummary).isRequired,
    searchTerm: string,
  };

  state = {
    sortBy: null,
    sortDirection: null,
  };

  sortWorkerPools = memoize(
    (workerPools, sortBy, sortDirection, searchTerm) => {
      const sortByProperty = camelCase(sortBy);
      const filteredWorkerPools = searchTerm
        ? workerPools.filter(({ workerPool }) =>
            workerPool.includes(searchTerm)
          )
        : workerPools;

      return isEmpty(filteredWorkerPools)
        ? filteredWorkerPools
        : [...filteredWorkerPools].sort((a, b) => {
            const firstElement =
              sortDirection === 'desc' ? b[sortByProperty] : a[sortByProperty];
            const secondElement =
              sortDirection === 'desc' ? a[sortByProperty] : b[sortByProperty];

            return sort(firstElement, secondElement);
          });
    },
    {
      serializer: ([workerPools, sortBy, sortDirection, searchTerm]) => {
        const ids = pipe(
          rSort((a, b) => sort(a.workerPool, b.workerPool)),
          map(({ workerPool }) => workerPool)
        )(workerPools);

        return `${ids.join('-')}-${sortBy}-${sortDirection}-${searchTerm}`;
      },
    }
  );

  handleHeaderClick = sortBy => {
    const toggled = this.state.sortDirection === 'desc' ? 'asc' : 'desc';
    const sortDirection = this.state.sortBy === sortBy ? toggled : 'desc';

    this.setState({ sortBy, sortDirection });
  };

  renderRow = workerPool => {
    const {
      match: { path },
    } = this.props;
    const iconSize = 16;

    return (
      <TableRow key={workerPool.workerPool}>
        <TableCell>
          <TableCellListItem
            button
            component={Link}
            to={`${path}/worker-pools/${workerPool.workerPool}`}>
            <ListItemText
              disableTypography
              primary={<Typography>{workerPool.workerPool}</Typography>}
            />
            <LinkIcon size={iconSize} />
          </TableCellListItem>
        </TableCell>

        <TableCell>
          <Typography>{workerPool.pendingCapacity}</Typography>
        </TableCell>

        <TableCell>
          <Typography>{workerPool.runningCapacity}</Typography>
        </TableCell>

        <TableCell>
          <Typography>{workerPool.pendingTasks}</Typography>
        </TableCell>

        <CopyToClipboard
          title={`${workerPool.lastActive} (Copy)`}
          text={workerPool.lastActive}>
          <TableCell>
            <TableCellListItem button>
              <ListItemText
                disableTypography
                primary={
                  <Typography>
                    <DateDistance from={workerPool.lastActive} />
                  </Typography>
                }
              />
              <ContentCopyIcon size={iconSize} />
            </TableCellListItem>
          </TableCell>
        </CopyToClipboard>

        <CopyToClipboard
          title={`${workerPool.lastResolved} (Copy)`}
          text={workerPool.lastResolved}>
          <TableCell>
            <TableCellListItem button>
              <ListItemText
                disableTypography
                primary={
                  <Typography>
                    <DateDistance from={workerPool.lastResolved} />
                  </Typography>
                }
              />
              <ContentCopyIcon size={iconSize} />
            </TableCellListItem>
          </TableCell>
        </CopyToClipboard>

        <TableCell>
          <Typography>{workerPool.failed}</Typography>
        </TableCell>

        <TableCell>
          <Typography>{workerPool.exception}</Typography>
        </TableCell>

        <TableCell>
          <Typography>{workerPool.unscheduled}</Typography>
        </TableCell>

        <TableCell>
          <TableCellListItem
            button
            component={Link}
            to={`${path}/providers/${workerPool.provider}`}>
            <ListItemText
              disableTypography
              primary={<Typography>{workerPool.provider}</Typography>}
            />
            <LinkIcon size={iconSize} />
          </TableCellListItem>
        </TableCell>
      </TableRow>
    );
  };

  render() {
    const { workerPools, searchTerm } = this.props;
    const { sortBy, sortDirection } = this.state;
    const sortedWorkerPools = this.sortWorkerPools(
      workerPools,
      sortBy,
      sortDirection,
      searchTerm
    );

    return (
      <DataTable
        items={sortedWorkerPools}
        headers={[
          'Worker Pool',
          'Pending Tasks',
          'Running Capacity',
          'Pending Capacity',
          'Last Active',
          'Last Resolved',
          'Failed',
          'Exception',
          'Unscheduled',
          'Provider',
        ]}
        sortByHeader={sortBy}
        sortDirection={sortDirection}
        onHeaderClick={this.handleHeaderClick}
        renderRow={this.renderRow}
        padding="dense"
      />
    );
  }
}
