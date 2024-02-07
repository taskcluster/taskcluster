import React, { Component, Fragment } from 'react';
import { arrayOf, func, shape, string } from 'prop-types';
import { pipe, map, sort as rSort } from 'ramda';
import { withStyles } from '@material-ui/core/styles';
import memoize from 'fast-memoize';
import LinkIcon from 'mdi-react/LinkIcon';
import { FixedSizeList } from 'react-window';
import Divider from '@material-ui/core/Divider';
import List from '@material-ui/core/List';
import ListItem from '@material-ui/core/ListItem';
import Typography from '@material-ui/core/Typography';
import sort from '../../utils/sort';
import Link from '../../utils/Link';
import { pageInfo, client } from '../../utils/prop-types';

const sorted = pipe(
  rSort((a, b) => sort(a.node.clientId, b.node.clientId)),
  map(({ node: { clientId } }) => clientId)
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
    /** Callback function fired when a page is changed. */
    onPageChange: func.isRequired,
    /** Clients GraphQL PageConnection instance. */
    clientsConnection: shape({
      edges: arrayOf(client),
      pageInfo,
    }).isRequired,
    /** A string to filter the list of results. */
    searchTerm: string,
    /**
     * If set, the component displays a list of role IDs
     * pertaining to that scope. Else, a list of scopes is shown.
     * */
    selectedScope: string,
  };

  // If the prop `selectedScope` is set, clients will be a list of client IDs.
  // Else, clients will be a list of scopes.
  clients = null;

  createSortedClientsConnection = memoize(
    (clientsConnection, selectedScope, searchTerm) => {
      const items = (clientsConnection.edges || [])
        .filter(
          node =>
            node.node.expandedScopes.filter(
              scope => scope.toLowerCase() === selectedScope.toLowerCase()
            ).length > 0
        )
        .map(node => node.node.clientId);

      return searchTerm
        ? items.filter(item => item.includes(searchTerm))
        : items;
    },
    {
      serializer: ([clientsConnection, selectedScope, searchTerm]) => {
        const ids = sorted(clientsConnection.edges);

        return `${ids.join('-')}-${selectedScope}-${searchTerm}`;
      },
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
    const {
      searchTerm,
      clientsConnection,
      selectedScope,
      onPageChange,
      classes,
      ...props
    } = this.props;
    const filteredItems = this.createSortedClientsConnection(
      clientsConnection,
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
