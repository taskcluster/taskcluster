import { Component } from 'react';
import { arrayOf, func, shape, string } from 'prop-types';
import { Link } from 'react-router-dom';
import {
  uniq,
  flatten,
  memoizeWith,
  filter,
  pipe,
  path,
  map,
  any,
  identity,
  contains,
  sort as rSort,
} from 'ramda';
import { withStyles } from '@material-ui/core/styles';
import ListItemText from '@material-ui/core/ListItemText';
import TableRow from '@material-ui/core/TableRow';
import TableCell from '@material-ui/core/TableCell';
import LinkIcon from 'mdi-react/LinkIcon';
import TableCellListItem from '../TableCellListItem';
import ConnectionDataTable from '../ConnectionDataTable';
import sort from '../../utils/sort';
import scopeMatch from '../../utils/scopeMatch';
import { VIEW_CLIENT_SCOPES_INSPECT_SIZE } from '../../utils/constants';
import { pageInfo, client, scopeExpansionLevel } from '../../utils/prop-types';

const sorted = pipe(
  rSort((a, b) => sort(a.node.clientId, b.node.clientId)),
  map(({ node: { clientId } }) => clientId)
);

@withStyles({
  listItemCell: {
    width: '100%',
  },
})
export default class ClientScopesTable extends Component {
  static propTypes = {
    /** Callback function fired when a page is changed. */
    onPageChange: func.isRequired,
    /** Clients GraphQL PageConnection instance. */
    clientsConnection: shape({
      edges: arrayOf(client),
      pageInfo,
    }).isRequired,
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

  // If the prop `selectedScope` is set, clients will be a list of client IDs.
  // Else, clients will be a list of scopes.
  clients = null;

  createSortedClientsConnection = memoizeWith(
    (clientsConnection, searchMode, selectedScope, searchProperty) => {
      const ids = sorted(clientsConnection.edges);

      return `${ids.join(
        '-'
      )}-${searchMode}-${selectedScope}-${searchProperty}`;
    },
    (clientsConnection, searchMode, selectedScope, searchProperty) => {
      const match = scopeMatch(searchMode, selectedScope);
      const extractExpandedScopes = pipe(
        map(path(['node', 'expandedScopes'])),
        flatten,
        uniq,
        searchMode ? filter(match) : identity,
        rSort(sort)
      );
      const extractClients = pipe(
        filter(
          pipe(
            path(['node', searchProperty]),
            any(match)
          )
        ),
        map(pipe(path(['node', 'clientId']))),
        rSort(sort)
      );

      if (clientsConnection) {
        this.clients = selectedScope
          ? extractClients(clientsConnection.edges)
          : extractExpandedScopes(clientsConnection.edges);
      }

      return clientsConnection;
    }
  );

  renderRow = (scope, index) => {
    const { searchTerm, classes, selectedScope } = this.props;

    if (index !== 0) {
      return null;
    }

    return pipe(
      searchTerm ? filter(contains(searchTerm)) : identity,
      map(node => (
        <TableRow key={node}>
          <TableCell padding="dense">
            <TableCellListItem
              className={classes.listItemCell}
              button
              component={Link}
              to={
                selectedScope
                  ? `/auth/clients/${encodeURIComponent(node)}`
                  : `/auth/scopes/${encodeURIComponent(node)}`
              }>
              <ListItemText disableTypography primary={<code>{node}</code>} />
              <LinkIcon size={16} />
            </TableCellListItem>
          </TableCell>
        </TableRow>
      ))
    )(this.clients);
  };

  render() {
    const {
      clientsConnection,
      searchMode,
      selectedScope,
      searchProperty,
      onPageChange,
      ...props
    } = this.props;
    const connection = this.createSortedClientsConnection(
      clientsConnection,
      searchMode,
      selectedScope,
      searchProperty
    );

    return (
      <ConnectionDataTable
        columnsSize={1}
        connection={connection}
        pageSize={VIEW_CLIENT_SCOPES_INSPECT_SIZE}
        renderRow={this.renderRow}
        onPageChange={onPageChange}
        {...props}
      />
    );
  }
}
