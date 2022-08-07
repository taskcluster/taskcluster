import React, { Component } from 'react';
import { arrayOf, func, shape, string } from 'prop-types';
import {
  filter,
  pipe,
  path,
  map,
  toLower,
  identity,
  includes,
  length,
  sort as rSort,
} from 'ramda';
import memoize from 'fast-memoize';
import TableRow from '@material-ui/core/TableRow';
import TableCell from '@material-ui/core/TableCell';
import LinkIcon from 'mdi-react/LinkIcon';
import ConnectionDataTable from '../ConnectionDataTable';
import sort from '../../utils/sort';
import Link from '../../utils/Link';
import { VIEW_CLIENT_SCOPES_INSPECT_SIZE } from '../../utils/constants';
import { pageInfo, client } from '../../utils/prop-types';
import TableCellItem from '../TableCellItem';

const sorted = pipe(
  rSort((a, b) => sort(a.node.clientId, b.node.clientId)),
  map(({ node: { clientId } }) => clientId)
);

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
    (clientsConnection, selectedScope) => {
      const extractClients = pipe(
        filter(
          pipe(
            path(['node', 'expandedScopes']),
            filter(pipe(toLower, includes(selectedScope), length))
          )
        ),
        map(pipe(path(['node', 'clientId']))),
        rSort(sort)
      );

      if (clientsConnection) {
        this.clients = extractClients(clientsConnection.edges);
      }

      return clientsConnection;
    },
    {
      serializer: ([clientsConnection, selectedScope]) => {
        const ids = sorted(clientsConnection.edges);

        return `${ids.join('-')}-${selectedScope}`;
      },
    }
  );

  renderRow = (scope, index) => {
    const { searchTerm, selectedScope } = this.props;

    if (index !== 0) {
      return null;
    }

    return pipe(
      searchTerm ? filter(includes(searchTerm)) : identity,
      map(node => (
        <TableRow key={node}>
          <TableCell>
            <Link
              to={
                selectedScope
                  ? `/auth/clients/${encodeURIComponent(node)}`
                  : `/auth/scopes/${encodeURIComponent(node)}`
              }>
              <TableCellItem button>
                {node}
                <LinkIcon size={16} />
              </TableCellItem>
            </Link>
          </TableCell>
        </TableRow>
      ))
    )(this.clients);
  };

  render() {
    const {
      searchTerm,
      clientsConnection,
      selectedScope,
      onPageChange,
      ...props
    } = this.props;
    const connection = this.createSortedClientsConnection(
      clientsConnection,
      selectedScope
    );

    return (
      <ConnectionDataTable
        searchTerm={searchTerm}
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
