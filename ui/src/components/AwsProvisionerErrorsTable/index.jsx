import React, { Component } from 'react';
import { arrayOf } from 'prop-types';
import { pipe, map, sort as rSort } from 'ramda';
import memoize from 'fast-memoize';
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
    sortBy: 'time',
    sortDirection: 'asc',
  };

  createSortedErrors = memoize(
    (errors, sortBy, sortDirection) => {
      if (!errors) {
        return null;
      }

      return [...errors].sort((a, b) => {
        const firstElement = sortDirection === 'desc' ? b[sortBy] : a[sortBy];
        const secondElement = sortDirection === 'desc' ? a[sortBy] : b[sortBy];

        if (sortBy === 'type') {
          return sort(
            this.getErrorType(firstElement),
            this.getErrorType(secondElement)
          );
        }

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

  getErrorType = type => {
    switch (type) {
      case 'INSTANCE_REQUEST': {
        return 'Error requesting new instance';
      }

      case 'TERMINATION': {
        return 'Error while running instance';
      }

      default: {
        return type;
      }
    }
  };

  handleHeaderClick = header => {
    const toggled = this.state.sortDirection === 'desc' ? 'asc' : 'desc';
    const sortDirection = this.state.sortBy === header.id ? toggled : 'desc';

    this.setState({ sortBy: header.id, sortDirection });
  };

  render() {
    const { errors } = this.props;
    const { sortBy, sortDirection } = this.state;
    const sortedErrors = this.createSortedErrors(errors, sortBy, sortDirection);
    const headers = [
      { label: 'AZ', id: 'az', type: 'string' },
      { label: 'Type', id: 'type', type: 'string' },
      {
        label: 'Instance Type',
        id: 'instanceType',
        type: 'string',
      },
      {
        label: 'Code',
        id: 'code',
        type: 'string',
      },
      {
        label: 'Region',
        id: 'region',
        type: 'string',
      },
      {
        label: 'Time',
        id: 'time',
        type: 'string',
      },
      {
        label: 'Message',
        id: 'message',
        type: 'string',
      },
    ];

    return (
      <DataTable
        items={sortedErrors}
        headers={headers}
        sortByLabel={sortBy}
        sortDirection={sortDirection}
        onHeaderClick={this.handleHeaderClick}
        noItemsMessage="Errors not available"
        renderRow={(error, index) => (
          <TableRow
            key={`${index}-${error.az}-${error.instanceType}-${error.type}-${error.time}`}>
            <TableCell>
              <Typography>{error.az}</Typography>
            </TableCell>
            <TableCell>
              <Typography>{this.getErrorType(error.type)}</Typography>
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
    );
  }
}
