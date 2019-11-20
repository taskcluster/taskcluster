import React, { Component } from 'react';
import { Link } from 'react-router-dom';
import { string, shape, func, arrayOf } from 'prop-types';
import { titleCase, upperCase } from 'change-case';
import classNames from 'classnames';
import { pipe, map, sort as rSort } from 'ramda';
import memoize from 'fast-memoize';
import { withStyles } from '@material-ui/core/styles';
import TableRow from '@material-ui/core/TableRow';
import TableCell from '@material-ui/core/TableCell';
import LinkIcon from 'mdi-react/LinkIcon';
import { notificationAddress, pageInfo } from '../../utils/prop-types';
import { VIEW_DENYLIST_PAGE_SIZE } from '../../utils/constants';
import sort from '../../utils/sort';
import ConnectionDataTable from '../ConnectionDataTable';

const sorted = pipe(
  rSort((a, b) => sort(a.node.notificationAddress, b.node.notificationAddress)),
  map(({ node: { notificationAddress } }) => notificationAddress)
);
const tableHeaders = ['Address', 'Type'];

@withStyles(theme => ({
  tableCell: {
    textDecoration: 'none',
  },
  listItemCell: {
    display: 'flex',
    justifyContent: 'space-between',
    width: '100%',
    padding: theme.spacing(1),
  },
  listLinkCell: {
    ...theme.mixins.hover,
    ...theme.mixins.listItemButton,
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
    sortBy: tableHeaders[0],
    sortDirection: 'asc',
  };

  propertyFromColName = colName => {
    // property correspiinding to the column name
    switch (colName) {
      case 'Address':
        return 'notificationAddress';
      case 'Type':
        return 'notificationType';
      default:
        return 'notificationAddress';
    }
  };

  createSortedNotifications = memoize(
    (notificationsConnection, sortBy, sortDirection) => {
      const sortByProperty = this.propertyFromColName(sortBy);

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

  prettify = str =>
    titleCase(str)
      .split(' ')
      .map(word => {
        const pretty = word === 'Irc' ? upperCase(word) : word;

        return pretty;
      })
      .join(' ');

  render() {
    const { classes, onPageChange, notificationsConnection } = this.props;
    const { sortBy, sortDirection } = this.state;
    const iconSize = 16;
    const sortedNotificationsConnection = this.createSortedNotifications(
      notificationsConnection,
      sortBy,
      sortDirection
    );

    return (
      <ConnectionDataTable
        connection={sortedNotificationsConnection}
        pageSize={VIEW_DENYLIST_PAGE_SIZE}
        onHeaderClick={this.handleHeaderClick}
        onPageChange={onPageChange}
        headers={tableHeaders}
        sortByHeader={sortBy}
        sortDirection={sortDirection}
        renderRow={({ node }) => (
          <TableRow key={node.notificationAddress}>
            <TableCell>
              <Link
                className={classes.tableCell}
                to={`/notify/denylist/${encodeURIComponent(
                  node.notificationAddress
                )}`}>
                <div
                  className={classNames(
                    classes.listItemCell,
                    classes.listLinkCell
                  )}>
                  {node.notificationAddress}
                  <LinkIcon size={iconSize} />
                </div>
              </Link>
            </TableCell>
            <TableCell>
              <div className={classes.listItemCell}>
                {this.prettify(node.notificationType)}
              </div>
            </TableCell>
          </TableRow>
        )}
      />
    );
  }
}
