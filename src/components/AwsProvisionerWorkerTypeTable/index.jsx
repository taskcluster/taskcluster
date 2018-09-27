import { Fragment, Component } from 'react';
import { Link } from 'react-router-dom';
import { string, arrayOf } from 'prop-types';
import { pipe, map, isEmpty, sort as rSort } from 'ramda';
import memoize from 'fast-memoize';
import { camelCase } from 'change-case/change-case';
import TableRow from '@material-ui/core/TableRow';
import TableCell from '@material-ui/core/TableCell';
import ListItemText from '@material-ui/core/ListItemText';
import Typography from '@material-ui/core/Typography';
import LinkIcon from 'mdi-react/LinkIcon';
import TableCellListItem from '../TableCellListItem';
import { awsProvisionerWorkerTypeSummary } from '../../utils/prop-types';
import sort from '../../utils/sort';
import DataTable from '../DataTable';

const sorted = pipe(
  rSort((a, b) => sort(a.workerType, b.workerType)),
  map(({ workerType }) => workerType)
);

export default class AwsProvisionerWorkerTypeTable extends Component {
  static propTypes = {
    /** A GraphQL roles response. */
    workerTypes: arrayOf(awsProvisionerWorkerTypeSummary).isRequired,
    /** A search term to refine the list of roles */
    searchTerm: string,
  };

  static defaultProps = {
    searchTerm: null,
  };

  state = {
    sortBy: null,
    sortDirection: null,
  };

  handleHeaderClick = sortBy => {
    const toggled = this.state.sortDirection === 'desc' ? 'asc' : 'desc';
    const sortDirection = this.state.sortBy === sortBy ? toggled : 'desc';

    this.setState({ sortBy, sortDirection });
  };

  createSortedWorkerTypes = memoize(
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
        const ids = sorted(workerTypes);

        return `${ids.join('-')}-${sortBy}-${sortDirection}-${searchTerm}`;
      },
    }
  );

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

    return (
      <Fragment>
        <DataTable
          items={sortedWorkerTypes}
          headers={[
            'Worker Type',
            'Pending Tasks',
            'Running Capacity',
            'Pending Capacity',
          ]}
          sortByHeader={sortBy}
          sortDirection={sortDirection}
          onHeaderClick={this.handleHeaderClick}
          renderRow={workerType => (
            <TableRow key={workerType.workerType}>
              <TableCell>
                <TableCellListItem
                  button
                  component={Link}
                  to={`/aws-provisioner/${workerType.workerType}`}>
                  <ListItemText
                    disableTypography
                    primary={
                      <Typography variant="body1">
                        {workerType.workerType}
                      </Typography>
                    }
                  />
                  <LinkIcon size={iconSize} />
                </TableCellListItem>
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
