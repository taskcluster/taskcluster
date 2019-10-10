import React, { Component, Fragment } from 'react';
import { string, arrayOf } from 'prop-types';
import { pipe, map, isEmpty, sort as rSort } from 'ramda';
import memoize from 'fast-memoize';
import TableRow from '@material-ui/core/TableRow';
import TableCell from '@material-ui/core/TableCell';
import ListItemText from '@material-ui/core/ListItemText';
import Typography from '@material-ui/core/Typography';
import LinkIcon from 'mdi-react/LinkIcon';
import TableCellItem from '../TableCellItem';
import { awsProvisionerWorkerTypeSummary } from '../../utils/prop-types';
import sort from '../../utils/sort';
import Link from '../../utils/Link';
import DataTable from '../DataTable';

const sorted = pipe(
  rSort((a, b) => sort(a.workerType, b.workerType)),
  map(({ workerType }) => workerType)
);

export default class AwsProvisionerWorkerTypeTable extends Component {
  static defaultProps = {
    searchTerm: null,
  };

  static propTypes = {
    /** A GraphQL roles response. */
    workerTypes: arrayOf(awsProvisionerWorkerTypeSummary).isRequired,
    /** A search term to refine the list of roles */
    searchTerm: string,
  };

  state = {
    sortBy: null,
    sortDirection: null,
  };

  createSortedWorkerTypes = memoize(
    (workerTypes, sortBy, sortDirection, searchTerm) => {
      const filteredWorkerTypes = searchTerm
        ? workerTypes.filter(({ workerType }) =>
            workerType.includes(searchTerm)
          )
        : workerTypes;

      return isEmpty(filteredWorkerTypes)
        ? filteredWorkerTypes
        : [...filteredWorkerTypes].sort((a, b) => {
            const firstElement =
              sortDirection === 'desc' ? b[sortBy] : a[sortBy];
            const secondElement =
              sortDirection === 'desc' ? a[sortBy] : b[sortBy];

            return sort(firstElement, secondElement);
          });
    },
    {
      serializer: ([workerTypes, sortBy, sortDirection, searchTerm]) => {
        const ids = sorted(workerTypes);

        return `${ids.join('-')}-${sortBy}-${sortDirection}-${searchTerm}`;
      },
    }
  );

  handleHeaderClick = header => {
    const toggled = this.state.sortDirection === 'desc' ? 'asc' : 'desc';
    const sortDirection = this.state.sortBy === header.id ? toggled : 'desc';

    this.setState({ sortBy: header.id, sortDirection });
  };

  render() {
    const { workerTypes, searchTerm } = this.props;
    const { sortBy, sortDirection } = this.state;
    const sortedWorkerTypes = this.createSortedWorkerTypes(
      workerTypes,
      sortBy,
      sortDirection,
      searchTerm
    );
    const iconSize = 16;
    const headers = [
      { label: 'Worker Type', id: 'workerType', type: 'string' },
      { label: 'Pending Tasks', id: 'pendingTasks', type: 'number' },
      {
        label: 'Running Capacity',
        id: 'runningCapacity',
        type: 'number',
      },
      {
        label: 'Pending Capacity',
        id: 'pendingCapacity',
        type: 'number',
      },
    ];

    return (
      <Fragment>
        <DataTable
          items={sortedWorkerTypes}
          headers={headers}
          sortByLabel={sortBy}
          sortDirection={sortDirection}
          onHeaderClick={this.handleHeaderClick}
          renderRow={workerType => (
            <TableRow key={workerType.workerType}>
              <TableCell>
                <TableCellItem
                  button
                  component={Link}
                  to={`/aws-provisioner/${workerType.workerType}`}>
                  <ListItemText
                    disableTypography
                    primary={<Typography>{workerType.workerType}</Typography>}
                  />
                  <LinkIcon size={iconSize} />
                </TableCellItem>
              </TableCell>
              <TableCell>
                <Typography>{workerType.pendingTasks}</Typography>
              </TableCell>
              <TableCell>
                <Typography>{workerType.runningCapacity}</Typography>
              </TableCell>
              <TableCell>
                <Typography>{workerType.pendingCapacity}</Typography>
              </TableCell>
            </TableRow>
          )}
        />
      </Fragment>
    );
  }
}
