import React, { Component } from 'react';
import { arrayOf, bool, func, shape, string } from 'prop-types';
import { camelCase } from 'camel-case';
import TableRow from '@material-ui/core/TableRow';
import TableCell from '@material-ui/core/TableCell';
import DeleteIcon from 'mdi-react/DeleteIcon';
import LinkIcon from 'mdi-react/LinkIcon';
import TableCellItem from '../TableCellItem';
import Button from '../Button';
import PaginatedDataTable from '../PaginatedDataTable';
import DateDistance from '../DateDistance';
import { VIEW_CLIENTS_PAGE_SIZE } from '../../utils/constants';
import { pagination } from '../../utils/prop-types';
import sort from '../../utils/sort';
import Link from '../../utils/Link';

const tableHeaders = ['Client ID', 'Last Date Used', ''];

export default class ClientsTable extends Component {
  static propTypes = {
    clients: arrayOf(
      shape({
        clientId: string.isRequired,
        lastDateUsed: string,
      })
    ).isRequired,
    ...pagination,
    onDialogActionOpen: func.isRequired,
    searchTerm: string,
    loading: bool,
  };

  static defaultProps = {
    searchTerm: null,
    loading: false,
    hasNextPage: false,
    hasPreviousPage: false,
  };

  state = {
    sortBy: tableHeaders[0],
    sortDirection: 'asc',
  };

  handleHeaderClick = sortBy => {
    const toggled = this.state.sortDirection === 'desc' ? 'asc' : 'desc';
    const sortDirection = this.state.sortBy === sortBy ? toggled : 'desc';

    this.setState({ sortBy, sortDirection });
  };

  render() {
    const {
      clients,
      searchTerm,
      loading,
      page,
      hasNextPage,
      hasPreviousPage,
      onNextPage,
      onPreviousPage,
      onDialogActionOpen,
    } = this.props;
    const { sortBy, sortDirection } = this.state;
    const iconSize = 16;
    const sortedClients = sortBy
      ? [...clients].sort((a, b) => {
          const prop = camelCase(sortBy);

          return sortDirection === 'desc'
            ? sort(b[prop], a[prop])
            : sort(a[prop], b[prop]);
        })
      : clients;

    return (
      <PaginatedDataTable
        searchTerm={searchTerm}
        items={sortedClients}
        pageSize={VIEW_CLIENTS_PAGE_SIZE}
        page={page}
        loading={loading}
        hasNextPage={hasNextPage}
        hasPreviousPage={hasPreviousPage}
        onNextPage={onNextPage}
        onPreviousPage={onPreviousPage}
        headers={tableHeaders}
        sortByHeader={sortBy}
        sortDirection={sortDirection}
        onHeaderClick={this.handleHeaderClick}
        allowFilter
        filterFunc={(client, filterValue) =>
          String(client.clientId).includes(filterValue)
        }
        renderRow={client => (
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
