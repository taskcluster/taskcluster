import React, { Component } from 'react';
import { shape, func, arrayOf, string } from 'prop-types';
import { pipe, map, sort as rSort } from 'ramda';
import { camelCase } from 'camel-case';
import TableRow from '@material-ui/core/TableRow';
import TableCell from '@material-ui/core/TableCell';
import DeleteIcon from 'mdi-react/DeleteIcon';
import LinkIcon from 'mdi-react/LinkIcon';
import { memoize } from '../../utils/memoize';
import TableCellItem from '../TableCellItem';
import Button from '../Button';
import ConnectionDataTable from '../ConnectionDataTable';
import DateDistance from '../DateDistance';
import { VIEW_CLIENTS_PAGE_SIZE } from '../../utils/constants';
import { pageInfo, client } from '../../utils/prop-types';
import sort from '../../utils/sort';
import Link from '../../utils/Link';

const sorted = pipe(
  rSort((a, b) => sort(a.node.clientId, b.node.clientId)),
  map(({ node: { clientId } }) => clientId)
);
const tableHeaders = ['Client ID', 'Last Date Used', ''];

export default class ClientsTable extends Component {
  static propTypes = {
    clientsConnection: shape({
      edges: arrayOf(client),
      pageInfo,
    }).isRequired,
    onPageChange: func.isRequired,
    /** A search term to refine the list of clients. */
    searchTerm: string,
    onDialogActionOpen: func.isRequired,
  };

  state = {
    sortBy: tableHeaders[0],
    sortDirection: 'asc',
  };

  createSortedClientsConnection = memoize(
    (clientsConnection, sortBy, sortDirection) => {
      const sortByProperty = sortBy ? camelCase(sortBy) : '';

      if (!sortBy) {
        return clientsConnection;
      }

      return {
        ...clientsConnection,
        edges: [...clientsConnection.edges].sort((a, b) => {
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
      serializer: ([clientsConnection, sortBy, sortDirection]) => {
        const ids = sorted(clientsConnection.edges);

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
    const {
      onPageChange,
      clientsConnection,
      searchTerm,
      onDialogActionOpen,
    } = this.props;
    const { sortBy, sortDirection } = this.state;
    const iconSize = 16;

    return (
      <ConnectionDataTable
        searchTerm={searchTerm}
        connection={this.createSortedClientsConnection(
          clientsConnection,
          sortBy,
          sortDirection
        )}
        pageSize={VIEW_CLIENTS_PAGE_SIZE}
        headers={tableHeaders}
        sortByHeader={sortBy}
        sortDirection={sortDirection}
        onHeaderClick={this.handleHeaderClick}
        onPageChange={onPageChange}
        allowFilter
        filterFunc={({ node: client }, filterValue) =>
          String(client.clientId).includes(filterValue)
        }
        renderRow={({ node: client }) => (
          <TableRow key={client.clientId}>
            <TableCell width="100%">
              <Link to={`/auth/clients/${encodeURIComponent(client.clientId)}`}>
                <TableCellItem button>
                  {client.clientId}
                  <LinkIcon size={iconSize} />
                </TableCellItem>
              </Link>
            </TableCell>
            <TableCell>
              <DateDistance from={client.lastDateUsed} />
            </TableCell>
            <TableCell>
              <Button
                requiresAuth
                tooltipProps={{ title: 'Delete Client' }}
                size="small"
                onClick={() => onDialogActionOpen(client.clientId)}>
                <DeleteIcon size={iconSize} />
              </Button>
            </TableCell>
          </TableRow>
        )}
      />
    );
  }
}
