import React, { Component } from 'react';
import { arrayOf, string } from 'prop-types';
import { Link, withRouter } from 'react-router-dom';
import {
  uniq,
  flatten,
  filter,
  pipe,
  map,
  contains,
  prop,
  pluck,
  sort as rSort,
} from 'ramda';
import memoize from 'fast-memoize';
import { withStyles } from '@material-ui/core/styles';
import ListItemText from '@material-ui/core/ListItemText';
import TableRow from '@material-ui/core/TableRow';
import TableCell from '@material-ui/core/TableCell';
import LinkIcon from 'mdi-react/LinkIcon';
import TableCellListItem from '../TableCellListItem';
import DataTable from '../DataTable';
import sort from '../../utils/sort';
import { role, scopeExpansionLevel } from '../../utils/prop-types';

const sorted = pipe(
  rSort((a, b) => sort(a.roleId, b.roleId)),
  map(({ roleId }) => roleId)
);

@withRouter
@withStyles({
  listItemCell: {
    width: '100%',
  },
})
export default class RoleScopesTable extends Component {
  static defaultProps = {
    searchTerm: null,
    selectedScope: null,
    searchProperty: 'expandedScopes',
  };

  static propTypes = {
    /** A GraphQL roles response. */
    roles: arrayOf(role).isRequired,
    /** The scope expansion level. */
    searchProperty: scopeExpansionLevel,
    /** A string to filter the list of results. */
    searchTerm: string,
    /**
     * If set, the component displays a list of role IDs
     * pertaining to that scope. Else, a list of scopes is shown.
     * */
    selectedScope: string,
  };

  createSortedRolesScopes = memoize(
    (roles, selectedScope, searchProperty) => {
      const extractExpandedScopes = pipe(
        pluck('expandedScopes'),
        flatten,
        uniq,
        rSort(sort)
      );
      const extractRoles = pipe(
        filter(prop(searchProperty)),
        pluck('roleId'),
        rSort(sort)
      );

      return selectedScope ? extractRoles(roles) : extractExpandedScopes(roles);
    },
    {
      serializer: ([roles, selectedScope, searchProperty]) =>
        `${sorted(roles).join('-')}-${selectedScope}-${searchProperty}`,
    }
  );

  renderRow = node => {
    const { classes, selectedScope } = this.props;
    const iconSize = 16;

    return (
      <TableRow key={node}>
        <TableCell padding="dense">
          <TableCellListItem
            className={classes.listItemCell}
            button
            component={Link}
            to={
              selectedScope
                ? `/auth/roles/${encodeURIComponent(node)}`
                : `/auth/scopes/${encodeURIComponent(node)}`
            }
          >
            <ListItemText disableTypography primary={node} />
            <LinkIcon size={iconSize} />
          </TableCellListItem>
        </TableCell>
      </TableRow>
    );
  };

  render() {
    const {
      roles,
      searchTerm,
      selectedScope,
      searchProperty,
      ...props
    } = this.props;
    const items = this.createSortedRolesScopes(
      roles,
      selectedScope,
      searchProperty
    );

    return (
      <DataTable
        columnsSize={1}
        items={searchTerm ? filter(contains(searchTerm), items) : items}
        renderRow={this.renderRow}
        {...props}
      />
    );
  }
}
