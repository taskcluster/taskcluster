import React, { Component, Fragment } from 'react';
import { arrayOf, shape, string } from 'prop-types';
import { pipe, map, sort as rSort } from 'ramda';
import { withStyles } from '@material-ui/core/styles';
import LinkIcon from 'mdi-react/LinkIcon';
import { FixedSizeList } from 'react-window';
import Divider from '@material-ui/core/Divider';
import List from '@material-ui/core/List';
import ListItem from '@material-ui/core/ListItem';
import Typography from '@material-ui/core/Typography';
import { memoize } from '../../utils/memoize';
import sort from '../../utils/sort';
import Link from '../../utils/Link';

const sorted = pipe(
  rSort((a, b) => sort(a.clientId, b.clientId)),
  map(({ clientId }) => clientId)
);

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
export default class ClientScopesTable extends Component {
  static defaultProps = {
    searchTerm: null,
    selectedScope: null,
  };

  static propTypes = {
    /** A list of clients, each including its expanded scopes. */
    clients: arrayOf(
      shape({
        clientId: string,
        expandedScopes: arrayOf(string),
      })
    ).isRequired,
    /** A string to filter the list of results. */
    searchTerm: string,
    /**
     * If set, the component displays a list of client IDs
     * pertaining to that scope. Else, a list of scopes is shown.
     * */
    selectedScope: string,
  };

  createSortedClients = memoize(
    (clients, selectedScope, searchTerm) => {
      const items = (clients || [])
        .filter(
          client =>
            client.expandedScopes.filter(
              scope => scope.toLowerCase() === selectedScope.toLowerCase()
            ).length > 0
        )
        .map(client => client.clientId);

      return searchTerm
        ? items.filter(item => item.includes(searchTerm))
        : items;
    },
    {
      serializer: ([clients, selectedScope, searchTerm]) => {
        const ids = sorted(clients);

        return `${ids.join('-')}-${selectedScope}-${searchTerm}`;
      },
    }
  );

  renderItem =
    items =>
    ({ index, style }) => {
      const { selectedScope, classes } = this.props;
      const item = items[index];
      const iconSize = 16;

      return (
        <Fragment>
          <Link
            to={
              selectedScope
                ? `/auth/clients/${encodeURIComponent(item)}`
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
    const { searchTerm, clients, selectedScope, classes, ...props } =
      this.props;
    const filteredItems = this.createSortedClients(
      clients,
      selectedScope,
      searchTerm
    );
    const windowHeight = window.innerHeight;
    const tableHeight = windowHeight > 400 ? 0.8 * windowHeight : 400;
    const itemCount = filteredItems.length;

    return itemCount ? (
      <List dense {...props}>
        <FixedSizeList height={tableHeight} itemCount={itemCount} itemSize={48}>
          {this.renderItem(filteredItems)}
        </FixedSizeList>
      </List>
    ) : (
      <Typography variant="body2" className={classes.noRolesText}>
        {searchTerm
          ? `No clients available for search term ${searchTerm}.`
          : 'No clients found.'}
      </Typography>
    );
  }
}
