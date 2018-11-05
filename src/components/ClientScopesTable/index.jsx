import React, { Component } from 'react';
import { arrayOf, func, shape, string } from 'prop-types';
import { Link } from 'react-router-dom';
import {
  uniq,
  flatten,
  filter,
  pipe,
  path,
  map,
  identity,
  contains,
  sort as rSort,
} from 'ramda';
import memoize from 'fast-memoize';
import { withStyles } from '@material-ui/core/styles';
import Typography from '@material-ui/core/Typography';
import TableRow from '@material-ui/core/TableRow';
import TableCell from '@material-ui/core/TableCell';
import LinkIcon from 'mdi-react/LinkIcon';
import ConnectionDataTable from '../ConnectionDataTable';
import sort from '../../utils/sort';
import { VIEW_CLIENT_SCOPES_INSPECT_SIZE } from '../../utils/constants';
import { pageInfo, client, scopeExpansionLevel } from '../../utils/prop-types';

const sorted = pipe(
  rSort((a, b) => sort(a.node.clientId, b.node.clientId)),
  map(({ node: { clientId } }) => clientId)
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
export default class ClientScopesTable extends Component {
  static defaultProps = {
    searchTerm: null,
    selectedScope: null,
    searchProperty: 'expandedScopes',
  };

  static propTypes = {
    /** Callback function fired when a page is changed. */
    onPageChange: func.isRequired,
    /** Clients GraphQL PageConnection instance. */
    clientsConnection: shape({
      edges: arrayOf(client),
      pageInfo,
    }).isRequired,
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

  // If the prop `selectedScope` is set, clients will be a list of client IDs.
  // Else, clients will be a list of scopes.
  clients = null;

  createSortedClientsConnection = memoize(
    (clientsConnection, selectedScope, searchProperty) => {
      const extractExpandedScopes = pipe(
        map(path(['node', 'expandedScopes'])),
        flatten,
        uniq,
        rSort(sort)
      );
      const extractClients = pipe(
        filter(path(['node', searchProperty])),
        map(pipe(path(['node', 'clientId']))),
        rSort(sort)
      );

      if (clientsConnection) {
        this.clients = selectedScope
          ? extractClients(clientsConnection.edges)
          : extractExpandedScopes(clientsConnection.edges);
      }

      return clientsConnection;
    },
    {
      serializer: ([clientsConnection, selectedScope, searchProperty]) => {
        const ids = sorted(clientsConnection.edges);

        return `${ids.join('-')}-${selectedScope}-${searchProperty}`;
      },
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
            <Link
              className={classes.tableCell}
              to={
                selectedScope
                  ? `/auth/clients/${encodeURIComponent(node)}`
                  : `/auth/scopes/${encodeURIComponent(node)}`
              }
            >
              <div className={classes.listItemCell}>
                <Typography>{node}</Typography>
                <LinkIcon size={16} />
              </div>
            </Link>
          </TableCell>
        </TableRow>
      ))
    )(this.clients);
  };

  render() {
    const {
      clientsConnection,
      selectedScope,
      searchProperty,
      onPageChange,
      ...props
    } = this.props;
    const connection = this.createSortedClientsConnection(
      clientsConnection,
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
