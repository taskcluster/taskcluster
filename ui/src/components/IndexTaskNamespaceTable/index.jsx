import React, { Component } from 'react';
import { func, shape, arrayOf } from 'prop-types';
import { pipe, map, sort as rSort } from 'ramda';
import memoize from 'fast-memoize';
import TableCell from '@material-ui/core/TableCell';
import TableRow from '@material-ui/core/TableRow';
import LinkIcon from 'mdi-react/LinkIcon';
import TableCellItem from '../TableCellItem';
import ConnectionDataTable from '../ConnectionDataTable';
import { VIEW_NAMESPACES_PAGE_SIZE } from '../../utils/constants';
import sort from '../../utils/sort';
import Link from '../../utils/Link';
import { pageInfo, indexedTask } from '../../utils/prop-types';

const sorted = pipe(
  rSort((a, b) => sort(a.node.namespace, b.node.namespace)),
  map(({ node: { namespace } }) => namespace)
);

/**
 * Display index task namespaces in a table.
 */
export default class IndexTaskNamespaceTable extends Component {
  static propTypes = {
    /** Callback function fired when a page is changed. */
    onPageChange: func.isRequired,
    /** IndexedTask GraphQL PageConnection instance. */
    connection: shape({
      edges: arrayOf(indexedTask),
      pageInfo,
    }).isRequired,
  };

  state = {
    sortBy: null,
    sortDirection: null,
  };

  createSortedTaskNamespaceConnection = memoize(
    (connection, sortBy, sortDirection) => {
      if (!sortBy) {
        return connection;
      }

      return {
        ...connection,
        edges: [...connection.edges].sort((a, b) => {
          const firstElement =
            sortDirection === 'desc'
              ? this.valueFromNode(b.node)
              : this.valueFromNode(a.node);
          const secondElement =
            sortDirection === 'desc'
              ? this.valueFromNode(a.node)
              : this.valueFromNode(b.node);

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

  taskFromNamespace = namespace => namespace.split('.').slice(-1)[0];

  valueFromNode(node) {
    const mapping = {
      Name: this.taskFromNamespace(node.namespace),
    };

    return mapping[this.state.sortBy];
  }

  render() {
    const { onPageChange, connection } = this.props;
    const { sortBy, sortDirection } = this.state;
    const sortedTaskConnection = this.createSortedTaskNamespaceConnection(
      connection,
      sortBy,
      sortDirection
    );
    const iconSize = 16;

    return (
      <ConnectionDataTable
        connection={sortedTaskConnection}
        pageSize={VIEW_NAMESPACES_PAGE_SIZE}
        sortByHeader={sortBy}
        sortDirection={sortDirection}
        onHeaderClick={this.handleHeaderClick}
        onPageChange={onPageChange}
        headers={['Name']}
        renderRow={({ node: { namespace } }) => (
          <TableRow key={namespace}>
            <TableCell>
              <Link
                to={`/tasks/index/${encodeURIComponent(
                  namespace
                    .split('.')
                    .slice(0, -1)
                    .join('.')
                )}/${this.taskFromNamespace(namespace)}`}>
                <TableCellItem button>
                  {this.taskFromNamespace(namespace)}
                  <LinkIcon size={iconSize} />
                </TableCellItem>
              </Link>
            </TableCell>
          </TableRow>
        )}
      />
    );
  }
}
