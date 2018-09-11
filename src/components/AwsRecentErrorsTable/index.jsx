import { Fragment, Component } from 'react';
import { pipe, map, isEmpty, sort as rSort } from 'ramda';
import { arrayOf } from 'prop-types';
import memoize from 'fast-memoize';
import { camelCase } from 'change-case/change-case';
import TableRow from '@material-ui/core/TableRow';
import TableCell from '@material-ui/core/TableCell';
import Typography from '@material-ui/core/Typography';
import DateDistance from '../DateDistance';
import { awsProvisionerRecentErrors } from '../../utils/prop-types';
import sort from '../../utils/sort';
import DataTable from '../DataTable';

const sorted = pipe(
  rSort((a, b) =>
    sort(
      `${a.type}-${a.az}-${a.workerType}-${a.time}`,
      `${b.type}-${b.az}-${b.workerType}-${b.time}`
    )
  ),
  map(({ type, az, workerType, time }) => `${type}-${az}-${workerType}-${time}`)
);

export default class AwsRecentErrorsTable extends Component {
  static propTypes = {
    /** A GraphQL awsProvisionerRecentErrors response. */
    // TODO: Add prop-types
    recentErrors: arrayOf(awsProvisionerRecentErrors).isRequired,
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

  createSortedRecentErrors = memoize(
    (recentErrors, sortBy, sortDirection) => {
      const sortByProperty = camelCase(sortBy);

      if (!recentErrors) {
        return null;
      }

      if (!sortBy) {
        return recentErrors;
      }

      return [...recentErrors].sort((a, b) => {
        const firstElement =
          sortDirection === 'desc' ? b[sortByProperty] : a[sortByProperty];
        const secondElement =
          sortDirection === 'desc' ? a[sortByProperty] : b[sortByProperty];

        return sort(firstElement, secondElement);
      });
    },
    {
      serializer: ([recentErrors, sortBy, sortDirection]) => {
        const ids = sorted(recentErrors);

        return `${ids.join('-')}-${sortBy}-${sortDirection}`;
      },
    }
  );

  render() {
    const { recentErrors } = this.props;
    const { sortBy, sortDirection } = this.state;
    const sortedRecentErrors = this.createSortedRecentErrors(
      recentErrors,
      sortBy,
      sortDirection
    );

    if (isEmpty(sortedRecentErrors)) {
      return <Typography>Health stats not available</Typography>;
    }

    return (
      <Fragment>
        <DataTable
          items={sortedRecentErrors}
          headers={[
            'AZ',
            'Type',
            'Region',
            'Instance Type',
            'Code',
            'Time',
            'Message',
          ]}
          sortByHeader={sortBy}
          sortDirection={sortDirection}
          onHeaderClick={this.handleHeaderClick}
          renderRow={item => (
            <TableRow
              key={`${item.type}-${item.az}-${item.workerType}-${item.time}`}>
              <TableCell>
                <Typography>{item.az}</Typography>
              </TableCell>
              <TableCell>
                <Typography>{item.type}</Typography>
              </TableCell>
              <TableCell>
                <Typography>{item.region}</Typography>
              </TableCell>
              <TableCell>
                <Typography>{item.instanceType}</Typography>
              </TableCell>
              <TableCell>
                <Typography>{<code>{item.code}</code>}</Typography>
              </TableCell>
              <TableCell>
                <DateDistance from={item.time} />
              </TableCell>
              <TableCell>
                <Typography>{item.message}</Typography>
              </TableCell>
            </TableRow>
          )}
        />
      </Fragment>
    );
  }
}
