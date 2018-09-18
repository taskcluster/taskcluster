import { Fragment, Component } from 'react';
import { arrayOf } from 'prop-types';
import { pipe, map, sort as rSort } from 'ramda';
import memoize from 'fast-memoize';
import { camelCase } from 'change-case/change-case';
import { withStyles } from '@material-ui/core/styles';
import TableRow from '@material-ui/core/TableRow';
import TableCell from '@material-ui/core/TableCell';
import Typography from '@material-ui/core/Typography';
import { awsProvisionerErrors } from '../../utils/prop-types';
import sort from '../../utils/sort';
import DataTable from '../DataTable';
import DateDistance from '../DateDistance';

const sorted = pipe(
  rSort((a, b) =>
    sort(
      `${a.az}-${a.instanceType}-${a.type}-${a.time}`,
      `${b.az}-${b.instanceType}-${b.type}-${b.time}`
    )
  ),
  map(({ region, az, instanceType }) => `${region}-${az}-${instanceType}`)
);

@withStyles(theme => ({
  emptyText: {
    marginTop: theme.spacing.unit,
  },
}))
export default class AwsProvisionerErrorsTable extends Component {
  static propTypes = {
    /** A GraphQL roles response. */
    errors: arrayOf(awsProvisionerErrors).isRequired,
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

  createSortedErrors = memoize(
    (errors, sortBy, sortDirection) => {
      const sortByProperty = camelCase(sortBy);

      if (!errors) {
        return null;
      }

      return [...errors].sort((a, b) => {
        const firstElement =
          sortDirection === 'desc' ? b[sortByProperty] : a[sortByProperty];
        const secondElement =
          sortDirection === 'desc' ? a[sortByProperty] : b[sortByProperty];

        return sort(firstElement, secondElement);
      });
    },
    {
      serializer: ([errors, sortBy, sortDirection]) => {
        const ids = sorted(errors);

        return `${ids.join('-')}-${sortBy}-${sortDirection}`;
      },
    }
  );

  render() {
    const { errors } = this.props;
    const { sortBy, sortDirection } = this.state;
    const sortedErrors = this.createSortedErrors(errors, sortBy, sortDirection);

    return (
      <Fragment>
        <DataTable
          items={sortedErrors}
          headers={[
            'AZ',
            'Type',
            'Instance Type',
            'Code',
            'Region',
            'Time',
            'Message',
          ]}
          sortByHeader={sortBy}
          sortDirection={sortDirection}
          onHeaderClick={this.handleHeaderClick}
          noItemsMessage="Errors not available"
          renderRow={error => (
            <TableRow
              key={`${error.az}-${error.instanceType}-${error.type}-${
                error.time
              }`}>
              <TableCell>
                <Typography>{error.az}</Typography>
              </TableCell>
              <TableCell>
                <Typography>{error.type}</Typography>
              </TableCell>
              <TableCell>
                <Typography>{error.instanceType}</Typography>
              </TableCell>
              <TableCell>
                <Typography>
                  <code>{error.code}</code>
                </Typography>
              </TableCell>
              <TableCell>
                <Typography>{error.region}</Typography>
              </TableCell>
              <TableCell>
                <DateDistance from={error.time} />
              </TableCell>
              <TableCell>
                <Typography>{error.message}</Typography>
              </TableCell>
            </TableRow>
          )}
        />
      </Fragment>
    );
  }
}
