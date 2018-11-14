import React, { Component, Fragment } from 'react';
import { Link } from 'react-router-dom';
import { string, arrayOf } from 'prop-types';
import { pipe, map, ifElse, isEmpty, identity, sort as rSort } from 'ramda';
import memoize from 'fast-memoize';
import { camelCase } from 'change-case/change-case';
import { withStyles } from '@material-ui/core/styles';
import TableRow from '@material-ui/core/TableRow';
import TableCell from '@material-ui/core/TableCell';
import Typography from '@material-ui/core/Typography';
import LinkIcon from 'mdi-react/LinkIcon';
import { role } from '../../utils/prop-types';
import sort from '../../utils/sort';
import DataTable from '../DataTable';

const sorted = pipe(
  rSort((a, b) => sort(a.roleId, b.roleId)),
  map(({ roleId }) => roleId)
);

@withStyles(theme => ({
  tableCell: {
    textDecoration: 'none',
  },
  listItemCell: {
    display: 'flex',
    justifyContent: 'space-between',
    width: '100%',
    padding: theme.spacing.unit,
    ...theme.mixins.hover,
  },
}))
export default class RolesTable extends Component {
  static defaultProps = {
    searchTerm: null,
  };

  static propTypes = {
    /** A GraphQL roles response. */
    roles: arrayOf(role).isRequired,
    /** A search term to refine the list of roles */
    searchTerm: string,
  };

  state = {
    sortBy: null,
    sortDirection: null,
  };

  createSortedRoles = memoize(
    (roles, sortBy, sortDirection, searchTerm) => {
      const sortByProperty = camelCase(sortBy);
      const filteredRoles = searchTerm
        ? roles.filter(({ roleId }) => roleId.includes(searchTerm))
        : roles;

      return ifElse(
        isEmpty,
        identity,
        rSort((a, b) => {
          const firstElement =
            sortDirection === 'desc' ? b[sortByProperty] : a[sortByProperty];
          const secondElement =
            sortDirection === 'desc' ? a[sortByProperty] : b[sortByProperty];

          return sort(firstElement, secondElement);
        })
      )(filteredRoles);
    },
    {
      serializer: ([roles, sortBy, sortDirection, searchTerm]) => {
        const ids = sorted(roles);

        return `${ids.join('-')}-${sortBy}-${sortDirection}-${searchTerm}`;
      },
    }
  );

  handleHeaderClick = sortBy => {
    const toggled = this.state.sortDirection === 'desc' ? 'asc' : 'desc';
    const sortDirection = this.state.sortBy === sortBy ? toggled : 'desc';

    this.setState({ sortBy, sortDirection });
  };

  render() {
    const { classes, roles, searchTerm } = this.props;
    const { sortBy, sortDirection } = this.state;
    const sortedRoles = this.createSortedRoles(
      roles,
      sortBy,
      sortDirection,
      searchTerm
    );
    const iconSize = 16;

    return (
      <Fragment>
        <DataTable
          items={sortedRoles}
          headers={['Role ID']}
          sortByHeader={sortBy}
          sortDirection={sortDirection}
          onHeaderClick={this.handleHeaderClick}
          renderRow={({ roleId }) => (
            <TableRow key={roleId}>
              <TableCell padding="dense">
                <Link
                  className={classes.tableCell}
                  to={`/auth/roles/${encodeURIComponent(roleId)}`}>
                  <div className={classes.listItemCell}>
                    <Typography>{roleId}</Typography>
                    <LinkIcon size={iconSize} />
                  </div>
                </Link>
              </TableCell>
            </TableRow>
          )}
        />
      </Fragment>
    );
  }
}
