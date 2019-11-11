import React, { Fragment, Component } from 'react';
import { arrayOf, string } from 'prop-types';
import { withRouter } from 'react-router-dom';
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
import { FixedSizeList } from 'react-window';
import { withStyles } from '@material-ui/core/styles';
import Typography from '@material-ui/core/Typography';
import List from '@material-ui/core/List';
import ListItem from '@material-ui/core/ListItem';
import Divider from '@material-ui/core/Divider';
import LinkIcon from 'mdi-react/LinkIcon';
import sort from '../../utils/sort';
import Link from '../../utils/Link';
import { role, scopeExpansionLevel } from '../../utils/prop-types';

const sorted = pipe(
  rSort((a, b) => sort(a.roleId, b.roleId)),
  map(({ roleId }) => roleId)
);

@withRouter
@withStyles(theme => ({
  listItemButton: {
    ...theme.mixins.listItemButton,
    display: 'flex',
    justifyContent: 'space-between',
  },
  listItemCell: {
    display: 'flex',
    justifyContent: 'space-between',
    width: '100%',
    padding: theme.spacing(1),
    ...theme.mixins.hover,
  },
  noRolesText: {
    marginTop: theme.spacing(2),
  },
}))
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

  renderItem = items => ({ index, style }) => {
    const { selectedScope, classes } = this.props;
    const item = items[index];
    const iconSize = 16;

    return (
      <Fragment>
        <Link
          to={
            selectedScope
              ? `/auth/roles/${encodeURIComponent(item)}`
              : `/auth/scopes/${encodeURIComponent(item)}`
          }>
          <ListItem className={classes.listItemButton} style={style} button>
            {item}
            <LinkIcon size={iconSize} />
          </ListItem>
        </Link>
        <Divider
          style={{
            ...style,
            height: 1,
          }}
        />
      </Fragment>
    );
  };

  render() {
    const {
      classes,
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
    const filteredItems = searchTerm
      ? filter(contains(searchTerm), items)
      : items;
    const windowHeight = window.innerHeight;
    const tableHeight = windowHeight > 400 ? 0.6 * windowHeight : 400;
    const itemCount = filteredItems.length;

    return itemCount ? (
      <List dense {...props}>
        <FixedSizeList height={tableHeight} itemCount={itemCount} itemSize={48}>
          {this.renderItem(items)}
        </FixedSizeList>
      </List>
    ) : (
      <Typography variant="body2" className={classes.noRolesText}>
        No roles available
      </Typography>
    );
  }
}
