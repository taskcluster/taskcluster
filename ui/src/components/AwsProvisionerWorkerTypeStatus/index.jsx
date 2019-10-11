import React, { Component } from 'react';
import { object } from 'prop-types';
import { pipe, map, sort as rSort } from 'ramda';
import memoize from 'fast-memoize';
import { withStyles } from '@material-ui/core/styles';
import TableRow from '@material-ui/core/TableRow';
import TableCell from '@material-ui/core/TableCell';
import Typography from '@material-ui/core/Typography';
import { awsProvisionerWorkerType } from '../../utils/prop-types';
import sort from '../../utils/sort';
import DataTable from '../DataTable';

const sorted = pipe(
  rSort((a, b) =>
    sort(`${a.instanceType}-${a.zone}`, `${b.instanceType}-${b.zone}`)
  ),
  map(({ instanceType, zone }) => `${instanceType}-${zone}`)
);
const sortedInstanceTypes = pipe(
  rSort((a, b) => sort(a.instanceType, b.instanceType)),
  map(({ instanceType }) => instanceType)
);

@withStyles(theme => ({
  emptyText: {
    marginTop: theme.spacing.unit,
  },
}))
export default class AwsProvisionerWorkerTypeStatus extends Component {
  static propTypes = {
    /** A GraphQL awsProvisionerWorkerType response. */
    workerType: awsProvisionerWorkerType.isRequired,
    /** A Graphql awsProvisionerWorkerTypeState response */
    awsState: object.isRequired,
  };

  state = {
    sortBy: null,
    sortDirection: null,
  };

  createItems = memoize(
    (workerType, awsState, availabilityZones) => {
      if (!availabilityZones.length) {
        return [];
      }

      const items = workerType.instanceTypes.reduce(
        (acc, instTypeDef) =>
          acc.concat(
            availabilityZones.map(zone => {
              const running = awsState.instances.filter(
                inst =>
                  inst.type === instTypeDef.instanceType &&
                  inst.state === 'running' &&
                  inst.zone === zone
              ).length;
              const pending = awsState.instances.filter(
                inst =>
                  inst.type === instTypeDef.instanceType &&
                  inst.state === 'pending' &&
                  inst.zone === zone
              ).length;

              return {
                ...instTypeDef,
                zone,
                running,
                pending,
              };
            })
          ),
        []
      );

      return items;
    },
    {
      serializer: ([workerType]) => {
        const ids = sortedInstanceTypes(workerType.instanceTypes);

        return ids;
      },
    }
  );

  createSortedStatuses = memoize(
    (statuses, sortBy, sortDirection) => {
      if (!statuses) {
        return null;
      }

      return [...statuses].sort((a, b) => {
        const firstElement =
          sortDirection === 'desc'
            ? this.valueFromNode(b)
            : this.valueFromNode(a);
        const secondElement =
          sortDirection === 'desc'
            ? this.valueFromNode(a)
            : this.valueFromNode(b);

        return sort(firstElement, secondElement);
      });
    },
    {
      serializer: ([statuses, sortBy, sortDirection]) => {
        const ids = sorted(statuses);

        return `${ids.join('-')}-${sortBy}-${sortDirection}`;
      },
    }
  );

  handleHeaderClick = header => {
    const toggled = this.state.sortDirection === 'desc' ? 'asc' : 'desc';
    const sortDirection = this.state.sortBy === header.id ? toggled : 'desc';

    this.setState({ sortBy: header.id, sortDirection });
  };

  valueFromNode(item) {
    const mapping = {
      instanceType: item.instanceType,
      availabilityZones: item.zone,
      runningInstances: item.running,
      pendingInstances: item.pending,
    };

    return mapping[this.state.sortBy];
  }

  render() {
    const { awsState, workerType } = this.props;
    const { sortBy, sortDirection } = this.state;
    const availabilityZones = [
      ...new Set([
        ...awsState.instances.map(({ zone }) => zone),
        ...awsState.requests.map(({ zone }) => zone),
      ]),
    ];
    const items = this.createItems(workerType, awsState, availabilityZones);
    const sortedStatuses = this.createSortedStatuses(
      items,
      sortBy,
      sortDirection
    );
    const headers = [
      { label: 'Instance Type', id: 'instanceType', type: 'string' },
      { label: 'Availability Zones', id: 'availabilityZones', type: 'string' },
      {
        label: 'Running Instances',
        id: 'runningInstances',
        type: 'number',
      },
      {
        label: 'Pending Instances',
        id: 'pendingInstances',
        type: 'number',
      },
    ];

    return (
      <DataTable
        items={sortedStatuses}
        headers={headers}
        sortByLabel={sortBy}
        sortDirection={sortDirection}
        onHeaderClick={this.handleHeaderClick}
        noItemsMessage="No running instances"
        renderRow={status => (
          <TableRow key={`${status.instanceType}-${status.zone}`}>
            <TableCell>
              <Typography>{status.instanceType}</Typography>
            </TableCell>
            <TableCell>
              <Typography>{status.zone}</Typography>
            </TableCell>
            <TableCell>
              <Typography>{status.running}</Typography>
            </TableCell>
            <TableCell>
              <Typography>{status.pending}</Typography>
            </TableCell>
          </TableRow>
        )}
      />
    );
  }
}
