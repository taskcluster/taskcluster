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
import { WorkerManagerWorkerTypeSummary } from '../../utils/prop-types';
import DataTable from '../DataTable';
import sort from '../../utils/sort';
import Link from '../../utils/Link';
import DateDistance from '../DateDistance';
import TableCellListItem from '../TableCellListItem';

@withRouter
export default class WorkerManagerWorkerTypesTable extends Component {
  static propTypes = {
    workerTypes: arrayOf(WorkerManagerWorkerTypeSummary).isRequired,
    searchTerm: string,
  };

  state = {
    sortBy: null,
    sortDirection: null,
  };

  sortWorkerTypes = memoize(
    (workerTypes, sortBy, sortDirection, searchTerm) => {
      const sortByProperty = camelCase(sortBy);
      const filteredWorkerTypes = searchTerm
        ? workerTypes.filter(({ workerType }) =>
            workerType.includes(searchTerm)
          )
        : workerTypes;

      return isEmpty(filteredWorkerTypes)
        ? filteredWorkerTypes
        : [...filteredWorkerTypes].sort((a, b) => {
            const firstElement =
              sortDirection === 'desc' ? b[sortByProperty] : a[sortByProperty];
            const secondElement =
              sortDirection === 'desc' ? a[sortByProperty] : b[sortByProperty];

            return sort(firstElement, secondElement);
          });
    },
    {
      serializer: ([workerTypes, sortBy, sortDirection, searchTerm]) => {
        const ids = pipe(
          rSort((a, b) => sort(a.workerType, b.workerType)),
          map(({ workerType }) => workerType)
        )(workerTypes);

        return `${ids.join('-')}-${sortBy}-${sortDirection}-${searchTerm}`;
      },
    }
  );

  handleHeaderClick = sortBy => {
    const toggled = this.state.sortDirection === 'desc' ? 'asc' : 'desc';
    const sortDirection = this.state.sortBy === sortBy ? toggled : 'desc';

    this.setState({ sortBy, sortDirection });
  };

  renderRow = workerType => {
    const { path } = this.props;
    const iconSize = 16;
    const { failedNumber, exceptionNumber, unscheduledNumber } = workerType;

    return (
      <TableRow key={workerType.name}>
        <TableCell>
          <TableCellListItem
            button
            component={Link}
            to={`${path}/worker-types/${workerType.name}`}>
            <ListItemText
              disableTypography
              primary={<Typography>{workerType.name}</Typography>}
            />
            <LinkIcon size={iconSize} />
          </TableCellListItem>
        </TableCell>

        <TableCell>
          <Typography>{workerType.pendingCapacity}</Typography>
        </TableCell>

        <TableCell>
          <Typography>{workerType.runningCapacity}</Typography>
        </TableCell>

        <TableCell>
          <Typography>{workerType.pendingTasks}</Typography>
        </TableCell>

        <CopyToClipboard
          title={`${workerType.lastActive} (Copy)`}
          text={workerType.lastActive}>
          <TableCell>
            <TableCellListItem button>
              <ListItemText
                disableTypography
                primary={
                  <Typography>
                    <DateDistance from={workerType.lastActive} />
                  </Typography>
                }
              />
              <ContentCopyIcon size={iconSize} />
            </TableCellListItem>
          </TableCell>
        </CopyToClipboard>

        <CopyToClipboard
          title={`${workerType.lastResolved} (Copy)`}
          text={workerType.lastResolved}>
          <TableCell>
            <TableCellListItem button>
              <ListItemText
                disableTypography
                primary={
                  <Typography>
                    <DateDistance from={workerType.lastResolved} />
                  </Typography>
                }
              />
              <ContentCopyIcon size={iconSize} />
            </TableCellListItem>
          </TableCell>
        </CopyToClipboard>

        <TableCell>
          <Typography>{failedNumber}</Typography>
        </TableCell>

        <TableCell>
          <Typography>{exceptionNumber}</Typography>
        </TableCell>

        <TableCell>
          <Typography>{unscheduledNumber}</Typography>
        </TableCell>

        <TableCell>
          <TableCellListItem
            button
            component={Link}
            to={`${path}/providers/${workerType.provider}`}>
            <ListItemText
              disableTypography
              primary={<Typography>{workerType.provider}</Typography>}
            />
            <LinkIcon size={iconSize} />
          </TableCellListItem>
        </TableCell>
      </TableRow>
    );
  };

  render() {
    const { workerTypes, searchTerm } = this.props;
    const { sortBy, sortDirection } = this.state;
    const sortedWorkerTypes = this.sortWorkerTypes(
      workerTypes,
      sortBy,
      sortDirection,
      searchTerm
    );

    return (
      <DataTable
        items={sortedWorkerTypes}
        headers={[
          'Worker Type',
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
