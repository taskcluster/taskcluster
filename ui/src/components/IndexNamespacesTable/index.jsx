import React, { Component } from 'react';
import { arrayOf, bool } from 'prop-types';
import TableCell from '@material-ui/core/TableCell';
import TableRow from '@material-ui/core/TableRow';
import LinkIcon from 'mdi-react/LinkIcon';
import TableCellItem from '../TableCellItem';
import PaginatedDataTable from '../PaginatedDataTable';
import { VIEW_NAMESPACES_PAGE_SIZE } from '../../utils/constants';
import sort from '../../utils/sort';
import Link from '../../utils/Link';
import { namespace, pagination } from '../../utils/prop-types';

const iconSize = 16;

/**
 * Display index namespaces in a table.
 */
export default class IndexNamespacesTable extends Component {
  static propTypes = {
    /** A page of index namespaces. */
    namespaces: arrayOf(namespace).isRequired,
    /** Whether the page currently displayed is still being fetched. */
    loading: bool,
    ...pagination,
  };

  static defaultProps = {
    loading: false,
    hasNextPage: false,
    hasPreviousPage: false,
  };

  state = {
    sortBy: null,
    sortDirection: null,
  };

  handleHeaderClick = sortBy => {
    const toggled = this.state.sortDirection === 'desc' ? 'asc' : 'desc';
    const sortDirection = this.state.sortBy === sortBy ? toggled : 'desc';

    this.setState({ sortBy, sortDirection });
  };

  render() {
    const {
      namespaces,
      loading,
      page,
      hasNextPage,
      hasPreviousPage,
      onNextPage,
      onPreviousPage,
    } = this.props;
    const { sortBy, sortDirection } = this.state;
    const sortedNamespaces = sortBy
      ? [...namespaces].sort((a, b) =>
          sortDirection === 'desc' ? sort(b.name, a.name) : sort(a.name, b.name)
        )
      : namespaces;

    return (
      <PaginatedDataTable
        items={sortedNamespaces}
        pageSize={VIEW_NAMESPACES_PAGE_SIZE}
        page={page}
        loading={loading}
        hasNextPage={hasNextPage}
        hasPreviousPage={hasPreviousPage}
        onNextPage={onNextPage}
        onPreviousPage={onPreviousPage}
        sortByHeader={sortBy}
        sortDirection={sortDirection}
        onHeaderClick={this.handleHeaderClick}
        headers={['Name']}
        renderRow={({ name, namespace }) => (
          <TableRow key={name}>
            <TableCell>
              <Link to={`/tasks/index/${encodeURIComponent(namespace)}`}>
                <TableCellItem button>
                  {name}
                  <LinkIcon size={iconSize} />
                </TableCellItem>
              </Link>
            </TableCell>
          </TableRow>
        )}
      />
    );
  }
}
