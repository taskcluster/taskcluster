import React, { Component } from 'react';
import { string, shape, func, arrayOf } from 'prop-types';
import { pipe, map, sort as rSort } from 'ramda';
import memoize from 'fast-memoize';
import { camelCase } from 'camel-case';
import { withStyles } from '@material-ui/core/styles';
import TableRow from '@material-ui/core/TableRow';
import TableCell from '@material-ui/core/TableCell';
import Box from '@material-ui/core/Box';
import DeleteIcon from 'mdi-react/DeleteIcon';
import LinkIcon from 'mdi-react/LinkIcon';
import TableCellItem from '../TableCellItem';
import Button from '../Button';
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

const iconSize = 16;

@withStyles(theme => ({
  roleLinkIcon: {
    display: 'block',
    height: iconSize + 'px',
    lineHeight: iconSize + 'px',
  },
  roleLinkContainer: {
    paddingLeft: theme.spacing(1),
    paddingRight: theme.spacing(1),
  },
  roleContainer: {
    width: '100%',
    display: 'flex',
    alignItems: 'center',
  },
  roleIdContainer: {
    flexGrow: 1
  }
})) 
export default class RolesTable extends Component {
  static propTypes = {
    rolesConnection: shape({
      edges: arrayOf(role),
      pageInfo,
    }).isRequired,
    onPageChange: func.isRequired,
    /** A search term to refine the list of roles */
    searchTerm: string,
    onDialogActionOpen: func,
  };

  static defaultProps = {
    searchTerm: null,
    onDialogActionOpen: null,
  };

  state = {
    sortBy: tableHeaders[0],
    sortDirection: 'asc',
  };

  createSortedRolesConnection = memoize(
    (rolesConnection, sortBy, sortDirection) => {
      const sortByProperty = sortBy ? camelCase(sortBy) : '';

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
    const { classes, onPageChange, rolesConnection, searchTerm, onDialogActionOpen } = this.props;
    const { sortBy, sortDirection } = this.state;
    const sortedRolesConnection = this.createSortedRolesConnection(
      rolesConnection,
      sortBy,
      sortDirection
    );

    return (
      <ConnectionDataTable
        searchTerm={searchTerm}
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
              <TableCellItem dense button>
                <Box className={classes.roleContainer}>
                  <Box className={classes.roleIdContainer}>
                    <Link to={`/auth/roles/${encodeURIComponent(role.roleId)}`}>
                      {role.roleId}
                    </Link>
                  </Box>
                  <Box className={classes.roleLinkContainer}>
                    <Link to={`/auth/roles/${encodeURIComponent(role.roleId)}`} className={classes.roleLinkIcon}>
                      <LinkIcon size={iconSize} />
                    </Link>
                  </Box>
                  <Button
                    requiresAuth
                    tooltipProps={{ title: 'Delete Role' }}
                    size="small"
                    onClick={() => onDialogActionOpen(role.roleId)}>
                    <DeleteIcon size={iconSize} />
                  </Button>
                </Box>
              </TableCellItem>
            </TableCell>
          </TableRow>
        )}
      />
    );
  }
}
