import TableCell from '@material-ui/core/TableCell';
import TableRow from '@material-ui/core/TableRow';
import { camelCase } from 'camel-case';
import LinkIcon from 'mdi-react/LinkIcon';
import { arrayOf, func, shape } from 'prop-types';
import { map, pipe, sort as rSort } from 'ramda';
import { Component } from 'react';
import { VIEW_NAMESPACES_PAGE_SIZE } from '../../utils/constants';
import Link from '../../utils/Link';
import { memoize } from '../../utils/memoize';
import { namespace, pageInfo } from '../../utils/prop-types';
import sort from '../../utils/sort';
import ConnectionDataTable from '../ConnectionDataTable';
import TableCellItem from '../TableCellItem';

const sorted = pipe(
  rSort((a, b) => sort(a.node.namespace, b.node.namespace)),
  map(({ node: { namespace } }) => namespace),
);

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
      const sortByProperty = sortBy ? camelCase(sortBy) : '';

      if (!sortBy) {
        return connection;
      }

      return {
        ...connection,
        edges: [...connection.edges].sort((a, b) => {
          const firstElement = sortDirection === 'desc' ? b.node[sortByProperty] : a.node[sortByProperty];
          const secondElement = sortDirection === 'desc' ? a.node[sortByProperty] : b.node[sortByProperty];

          return sort(firstElement, secondElement);
        }),
      };
    },
    {
      serializer: ([connection, sortBy, sortDirection]) => {
        const ids = sorted(connection.edges);

        return `${ids.join('-')}-${sortBy}-${sortDirection}`;
      },
    },
  );

  handleHeaderClick = (sortBy) => {
    const toggled = this.state.sortDirection === 'desc' ? 'asc' : 'desc';
    const sortDirection = this.state.sortBy === sortBy ? toggled : 'desc';

    this.setState({ sortBy, sortDirection });
  };

  render() {
    const { onPageChange, connection } = this.props;
    const { sortBy, sortDirection } = this.state;
    const sortedNamespacesConnection = this.createSortedNamespacesConnection(connection, sortBy, sortDirection);
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
              <Link to={`/tasks/index/${encodeURIComponent(namespace)}`}>
                <TableCellItem button>
                  {name}
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
