import React, { Component } from 'react';
import { Link } from 'react-router-dom';
import { string, shape, func, arrayOf } from 'prop-types';
import { pipe, map, sort as rSort } from 'ramda';
import memoize from 'fast-memoize';
import { camelCase } from 'change-case/change-case';
import { withStyles } from '@material-ui/core/styles';
import TableRow from '@material-ui/core/TableRow';
import TableCell from '@material-ui/core/TableCell';
import Typography from '@material-ui/core/Typography';
import { notificationAddress, pageInfo } from '../../utils/prop-types';
import { VIEW_DENYLISTED_NOTIFICATIONS_PAGE_SIZE } from '../../utils/constants';
import sort from '../../utils/sort';
import ConnectionDataTable from '../ConnectionDataTable';

const sorted = pipe(
  rSort((a, b) => sort(a.node.notificationAddress, b.node.notificationAddress)),
  map(({ node: { notificationAddress } }) => notificationAddress)
);
const tableHeaders = ['Notification Type', 'Destination'];

@withStyles(theme => ({
  tableCell: {
    textDecoration: 'none',
  },
  listItemCell: {
    display: 'flex',
    justifyContent: 'flex-start',
    width: '100%',
    padding: theme.spacing.unit,
    ...theme.mixins.hover,
  },
}))
export default class DenylistTable extends Component {
  static defaultProps = {
    searchTerm: null,
  };

  static propTypes = {
    /** A GraphQL denylisted notifications response. */
    notificationsConnection: shape({
      edges: arrayOf(notificationAddress),
      pageInfo,
    }).isRequired,
    onPageChange: func.isRequired,
    /** A search term to refine the list of notifications */
    searchTerm: string,
  };

  state = {
    sortBy: tableHeaders[1],
    sortDirection: 'asc',
  };

  createSortedNotifications = memoize(
    (notificationsConnection, sortBy, sortDirection) => {
      // if destination coulumn is clicked sort by notificationAddress property
      const sortByProperty =
        camelCase(sortBy) === 'destination'
          ? 'notificationAddress'
          : camelCase(sortBy);

      if (!sortBy) {
        return notificationsConnection;
      }

      return {
        ...notificationsConnection,
        edges: [...notificationsConnection.edges].sort((a, b) => {
          const firstElement =
            sortDirection === 'desc'
              ? b.node[sortByProperty]
              : a.node[sortByProperty];
          const secondElement =
            sortDirection === 'desc'
              ? a.node[sortByProperty]
              : b.node[sortByProperty];

          return sort(firstElement, secondElement);
        }),
      };
    },
    {
      serializer: ([notificationsConnection, sortBy, sortDirection]) => {
        const ids = sorted(notificationsConnection.edges);

        return `${ids.join('-')}-${sortBy}-${sortDirection}`;
      },
    }
  );

  handleHeaderClick = sortBy => {
    const toggled = this.state.sortDirection === 'desc' ? 'asc' : 'desc';
    const sortDirection = this.state.sortBy === sortBy ? toggled : 'desc';

    this.setState({ sortBy, sortDirection });
  };

  render() {
    const { classes, onPageChange, notificationsConnection } = this.props;
    const { sortBy, sortDirection } = this.state;
    const sortedNotificationsConnection = this.createSortedNotifications(
      notificationsConnection,
      sortBy,
      sortDirection
    );

    return (
      <ConnectionDataTable
        connection={sortedNotificationsConnection}
        pageSize={VIEW_DENYLISTED_NOTIFICATIONS_PAGE_SIZE}
        onHeaderClick={this.handleHeaderClick}
        onPageChange={onPageChange}
        headers={tableHeaders}
        sortByHeader={sortBy}
        sortDirection={sortDirection}
        renderRow={({ node }) => (
          <TableRow key={node.notificationAddress}>
            <TableCell>
              <div>
                <Typography>{node.notificationType}</Typography>
              </div>
            </TableCell>
            <TableCell padding="dense">
              <Link
                className={classes.tableCell}
                to={`/denylist/${encodeURIComponent(
                  node.notificationAddress
                )}`}>
                <div className={classes.listItemCell}>
                  <Typography>{node.notificationAddress}</Typography>
                </div>
              </Link>
            </TableCell>
          </TableRow>
        )}
      />
    );
  }
}
