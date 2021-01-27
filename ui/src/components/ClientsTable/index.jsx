import React, { Component } from 'react';
import { shape, func, arrayOf, string } from 'prop-types';
import { pipe, map, sort as rSort } from 'ramda';
import memoize from 'fast-memoize';
import { camelCase } from 'camel-case';
import { withStyles } from '@material-ui/core/styles';
import TableRow from '@material-ui/core/TableRow';
import TableCell from '@material-ui/core/TableCell';
import Box from '@material-ui/core/Box';
import DeleteIcon from 'mdi-react/DeleteIcon';
import LinkIcon from 'mdi-react/LinkIcon';
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
const tableHeaders = ['Client ID', 'Last Date Used'];
const iconSize = 16;

@withStyles(theme => ({
  clientLinkIcon: {
    display: 'block',
    height: `${iconSize}px`,
    lineHeight: `${iconSize}px`,
  },
  clientLinkContainer: {
    paddingLeft: theme.spacing(1),
    paddingRight: theme.spacing(1),
  },
  clientContainer: {
    width: '100%',
    display: 'flex',
    alignItems: 'center',
  },
  clientIdContainer: {
    flexGrow: 1,
  },
}))
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
      classes,
      onPageChange,
      clientsConnection,
      searchTerm,
      onDialogActionOpen,
    } = this.props;
    const { sortBy, sortDirection } = this.state;

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
        renderRow={({ node: client }) => (
          <TableRow key={client.clientId}>
            <TableCell>
              <TableCellItem dense button>
                <Box className={classes.clientContainer}>
                  <Box className={classes.clientIdContainer}>
                    <Link
                      to={`/auth/clients/${encodeURIComponent(
                        client.clientId
                      )}`}>
                      {client.clientId}
                    </Link>
                  </Box>
                  <Box className={classes.clientLinkContainer}>
                    <Link
                      to={`/auth/clients/${encodeURIComponent(
                        client.clientId
                      )}`}
                      className={classes.clientLinkIcon}>
                      <LinkIcon size={iconSize} />
                    </Link>
                  </Box>
                  <Button
                    requiresAuth
                    tooltipProps={{ title: 'Delete Client' }}
                    size="small"
                    onClick={() => onDialogActionOpen(client.clientId)}>
                    <DeleteIcon size={iconSize} />
                  </Button>
                </Box>
              </TableCellItem>
            </TableCell>
            <TableCell>
              <DateDistance from={client.lastDateUsed} />
            </TableCell>
          </TableRow>
        )}
      />
    );
  }
}
