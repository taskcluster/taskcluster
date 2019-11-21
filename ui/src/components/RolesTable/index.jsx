import React, { Component } from 'react';
import { string, shape, func, arrayOf } from 'prop-types';
import { pipe, map, sort as rSort } from 'ramda';
import memoize from 'fast-memoize';
import { camelCase } from 'change-case/change-case';
import TableRow from '@material-ui/core/TableRow';
import TableCell from '@material-ui/core/TableCell';
import LinkIcon from 'mdi-react/LinkIcon';
import TableCellItem from '../TableCellItem';
import sort from '../../utils/sort';
import ConnectionDataTable from '../ConnectionDataTable';
import { VIEW_ROLES_PAGE_SIZE } from '../../utils/constants';
import { pageInfo, role } from '../../utils/prop-types';
import Link from '../../utils/Link';

const sorted = pipe(
  rSort((a, b) => sort(a.node.roleId, b.node.roleId)),
  map(({ node: { roleId } }) => roleId)
);
const tableHeaders = ['Role ID'];

export default class RolesTable extends Component {
  static defaultProps = {
    searchTerm: null,
  };

  static propTypes = {
    rolesConnection: shape({
      edges: arrayOf(role),
      pageInfo,
    }).isRequired,
    onPageChange: func.isRequired,
    /** A search term to refine the list of roles */
    searchTerm: string,
  };

  state = {
    sortBy: tableHeaders[0],
    sortDirection: 'asc',
  };

  createSortedRolesConnection = memoize(
    (rolesConnection, sortBy, sortDirection) => {
      const sortByProperty = camelCase(sortBy);

      if (!sortBy) {
        return rolesConnection;
      }

      return {
        ...rolesConnection,
        edges: [...rolesConnection.edges].sort((a, b) => {
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
      serializer: ([rolesConnection, sortBy, sortDirection]) => {
        const ids = sorted(rolesConnection.edges);

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
    const { onPageChange, rolesConnection } = this.props;
    const { sortBy, sortDirection } = this.state;
    const iconSize = 16;
    const sortedRolesConnection = this.createSortedRolesConnection(
      rolesConnection,
      sortBy,
      sortDirection
    );

    return (
      <ConnectionDataTable
        connection={sortedRolesConnection}
        pageSize={VIEW_ROLES_PAGE_SIZE}
        onHeaderClick={this.handleHeaderClick}
        onPageChange={onPageChange}
        headers={tableHeaders}
        sortByHeader={sortBy}
        sortDirection={sortDirection}
        renderRow={({ node: role }) => (
          <TableRow key={role.roleId}>
            <TableCell>
              <Link to={`/auth/roles/${encodeURIComponent(role.roleId)}`}>
                <TableCellItem dense button>
                  {role.roleId}
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
