import React, { Component } from 'react';
import { Link } from 'react-router-dom';
import { func, shape, arrayOf } from 'prop-types';
import { pipe, map, sort as rSort } from 'ramda';
import memoize from 'fast-memoize';
import { withStyles } from '@material-ui/core/styles';
import TableCell from '@material-ui/core/TableCell';
import ListItemText from '@material-ui/core/ListItemText';
import TableRow from '@material-ui/core/TableRow';
import LinkIcon from 'mdi-react/LinkIcon';
import { camelCase } from 'change-case';
import TableCellListItem from '../TableCellListItem';
import ConnectionDataTable from '../ConnectionDataTable';
import { VIEW_NAMESPACES_PAGE_SIZE } from '../../utils/constants';
import sort from '../../utils/sort';
import { pageInfo, namespace } from '../../utils/prop-types';

const sorted = pipe(
  rSort((a, b) => sort(a.node.namespace, b.node.namespace)),
  map(({ node: { namespace } }) => namespace)
);

@withStyles({
  listItemCell: {
    width: '100%',
  },
})
/**
 * Display index namespaces in a table.
 */
export default class IndexNamespacesTable extends Component {
  static propTypes = {
    /** Callback function fired when a page is changed. */
    onPageChange: func.isRequired,
    /** Namespace GraphQL PageConnection instance. */
    connection: shape({
      edges: arrayOf(namespace),
      pageInfo,
    }).isRequired,
  };

  state = {
    sortBy: null,
    sortDirection: null,
  };

  createSortedNamespacesConnection = memoize(
    (connection, sortBy, sortDirection) => {
      const sortByProperty = camelCase(sortBy);

      if (!sortBy) {
        return connection;
      }

      return {
        ...connection,
        edges: [...connection.edges].sort((a, b) => {
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
      serializer: ([connection, sortBy, sortDirection]) => {
        const ids = sorted(connection.edges);

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
    const { onPageChange, classes, connection } = this.props;
    const { sortBy, sortDirection } = this.state;
    const sortedNamespacesConnection = this.createSortedNamespacesConnection(
      connection,
      sortBy,
      sortDirection
    );
    const iconSize = 16;

    return (
      <ConnectionDataTable
        connection={sortedNamespacesConnection}
        pageSize={VIEW_NAMESPACES_PAGE_SIZE}
        sortByHeader={sortBy}
        sortDirection={sortDirection}
        onHeaderClick={this.handleHeaderClick}
        onPageChange={onPageChange}
        headers={['Name']}
        renderRow={({ node: { name, namespace } }) => (
          <TableRow key={name}>
            <TableCell>
              <TableCellListItem
                className={classes.listItemCell}
                dense
                button
                component={Link}
                to={`/tasks/index/${encodeURIComponent(namespace)}`}>
                <ListItemText disableTypography primary={name} />
                <LinkIcon size={iconSize} />
              </TableCellListItem>
            </TableCell>
          </TableRow>
        )}
      />
    );
  }
}
