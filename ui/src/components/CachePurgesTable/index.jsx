import React, { Component } from 'react';
import { string, bool, arrayOf } from 'prop-types';
import { pipe, map, sort as rSort } from 'ramda';
import { camelCase } from 'camel-case';
import TableCell from '@material-ui/core/TableCell';
import TableRow from '@material-ui/core/TableRow';
import DateDistance from '../DateDistance';
import PaginatedDataTable from '../PaginatedDataTable';
import { VIEW_CACHE_PURGES_PAGE_SIZE } from '../../utils/constants';
import { memoize } from '../../utils/memoize';
import sort from '../../utils/sort';
import { pagination, cachePurge } from '../../utils/prop-types';

const sorted = pipe(
  rSort((a, b) => sort(a.cacheName, b.cacheName)),
  map(({ cacheName }) => cacheName)
);

/**
 * Display active cache purges in a table.
 */
export default class CachePurgesTable extends Component {
  static propTypes = {
    /** A flat array of cache purge objects. */
    cachePurges: arrayOf(cachePurge).isRequired,
    /** A search term to refine the list of cache purges. */
    searchTerm: string,
    loading: bool,
    ...pagination,
  };

  static defaultProps = {
    searchTerm: null,
    loading: false,
    hasNextPage: false,
    hasPreviousPage: false,
  };

  state = {
    sortBy: null,
    sortDirection: null,
  };

  createSortedCachePurges = memoize(
    (cachePurges, sortBy, sortDirection, searchTerm) => {
      const sortByProperty = sortBy ? camelCase(sortBy) : '';
      const filtered = searchTerm
        ? cachePurges.filter(item => item.cacheName.includes(searchTerm))
        : cachePurges;

      return [...filtered].sort((a, b) => {
        const first =
          sortDirection === 'desc' ? b[sortByProperty] : a[sortByProperty];
        const second =
          sortDirection === 'desc' ? a[sortByProperty] : b[sortByProperty];

        return sort(first, second);
      });
    },
    {
      serializer: ([cachePurges, sortBy, sortDirection, searchTerm]) => {
        const ids = sorted(cachePurges);

        return `${ids.join('-')}-${sortBy}-${sortDirection}-${searchTerm}`;
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
      cachePurges,
      searchTerm,
      loading,
      page,
      hasNextPage,
      hasPreviousPage,
      onNextPage,
      onPreviousPage,
    } = this.props;
    const { sortBy, sortDirection } = this.state;
    const sortedCachePurges = this.createSortedCachePurges(
      cachePurges,
      sortBy,
      sortDirection,
      searchTerm
    );

    return (
      <PaginatedDataTable
        searchTerm={searchTerm}
        size="medium"
        items={sortedCachePurges}
        pageSize={VIEW_CACHE_PURGES_PAGE_SIZE}
        page={page}
        loading={loading}
        hasNextPage={hasNextPage}
        hasPreviousPage={hasPreviousPage}
        onNextPage={onNextPage}
        onPreviousPage={onPreviousPage}
        sortByHeader={sortBy}
        sortDirection={sortDirection}
        onHeaderClick={this.handleHeaderClick}
        headers={['Provisioner ID', 'Worker Type', 'Cache Name', 'Before']}
        renderRow={(
          { provisionerId, workerType, cacheName, before },
          _style,
          index
        ) => (
          <TableRow key={cacheName || index}>
            <TableCell>{provisionerId}</TableCell>
            <TableCell>{workerType}</TableCell>
            <TableCell>{cacheName}</TableCell>
            <TableCell>
              <DateDistance from={before} />
            </TableCell>
          </TableRow>
        )}
      />
    );
  }
}
