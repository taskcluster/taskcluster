import { Component } from 'react';
import { arrayOf, string } from 'prop-types';
import { Link, withRouter } from 'react-router-dom';
import {
  uniq,
  flatten,
  memoizeWith,
  filter,
  pipe,
  map,
  identity,
  contains,
  any,
  prop,
  pluck,
  sort as rSort,
} from 'ramda';
import { withStyles } from 'material-ui/styles';
import { ListItemText } from 'material-ui/List';
import { TableRow, TableCell } from 'material-ui/Table';
import LinkIcon from 'mdi-react/LinkIcon';
import TableCellListItem from '../TableCellListItem';
import DataTable from '../DataTable';
import scopeMatch from '../../utils/scopeMatch';
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
  static propTypes = {
    /** A GraphQL roles response. */
    roles: arrayOf(role).isRequired,
    /** The entity search mode for scopes. */
    searchMode: string,
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

  static defaultProps = {
    searchTerm: null,
    selectedScope: null,
    searchMode: null,
    searchProperty: 'expandedScopes',
  };

  createSortedRolesScopes = memoizeWith(
    (roles, searchMode, selectedScope, searchProperty) =>
      `${sorted(roles).join(
        '-'
      )}-${searchMode}-${selectedScope}-${searchProperty}`,
    (roles, searchMode, selectedScope, searchProperty) => {
      const match = scopeMatch(searchMode, selectedScope);
      const extractExpandedScopes = pipe(
        pluck('expandedScopes'),
        flatten,
        uniq,
        searchMode ? filter(match) : identity,
        rSort(sort)
      );
      const extractRoles = pipe(
        filter(pipe(prop(searchProperty), any(match))),
        pluck('roleId'),
        rSort(sort)
      );

      return selectedScope ? extractRoles(roles) : extractExpandedScopes(roles);
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
            }>
            <ListItemText disableTypography primary={<code>{node}</code>} />
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
      searchMode,
      selectedScope,
      searchProperty,
      ...props
    } = this.props;
    const items = this.createSortedRolesScopes(
      roles,
      searchMode,
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
