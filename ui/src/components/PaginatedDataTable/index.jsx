import React, { Fragment, useState } from 'react';
import { array, arrayOf, bool, func, number, oneOf, string } from 'prop-types';
import classNames from 'classnames';
import { makeStyles } from '@material-ui/core/styles';
import Table from '@material-ui/core/Table';
import TableBody from '@material-ui/core/TableBody';
import TableHead from '@material-ui/core/TableHead';
import TableSortLabel from '@material-ui/core/TableSortLabel';
import TablePagination from '@material-ui/core/TablePagination';
import TableRow from '@material-ui/core/TableRow';
import TableCell from '@material-ui/core/TableCell';
import TextField from '@material-ui/core/TextField';
import InputAdornment from '@material-ui/core/InputAdornment';
import FilterIcon from 'mdi-react/FilterIcon';
import { WindowScroller, AutoSizer, List } from 'react-virtualized';
import Spinner from '../Spinner';

const useStyles = makeStyles(theme => ({
  spinner: {
    height: 56,
    minHeight: 56,
    paddingRight: 2,
    display: 'flex',
    alignItems: 'center',
    flexDirection: 'row-reverse',
  },
  tableWrapper: {
    overflowX: 'auto',
  },
  thWithTopPagination: {
    height: theme.spacing(4),
  },
  sortHeader: {
    color: theme.palette.text.secondary,
  },
  filter: {
    marginTop: theme.spacing(-1),
    marginBottom: theme.spacing(1),
    marginLeft: theme.spacing(2),
    marginRight: theme.spacing(2),
    width: '96%',
  },
}));

/**
 * A paginated table over a plain array of items.
 *
 * The REST counterpart to ConnectionDataTable: continuation tokens only ever
 * point forwards, so the caller owns the page and hands over one page at a
 * time. This component just reports which direction was clicked.
 */
export default function PaginatedDataTable({
  items,
  renderRow,
  pageSize,
  page,
  loading = false,
  hasNextPage = false,
  hasPreviousPage = false,
  onNextPage,
  onPreviousPage,
  columnsSize = null,
  headers = null,
  sortByHeader = null,
  sortDirection = 'desc',
  onHeaderClick = null,
  withoutTopPagination = false,
  noItemsMessage = 'No items for this page.',
  searchTerm = null,
  size = 'small',
  allowFilter = false,
  filterFunc = null,
  lazyRender = false,
  rowHeight = 48,
}) {
  const classes = useStyles();
  const [filterValue, setFilterValue] = useState('');
  const colSpan = columnsSize || headers?.length || 1;
  const rows =
    allowFilter && filterFunc
      ? items.filter(row => filterFunc(row, filterValue))
      : items;
  const showFilter = allowFilter && items.length > 10;

  const count = (page + 1) * pageSize + (hasNextPage ? pageSize : 0);
  const handlePageChange = (_e, nextPage) => {
    if (nextPage > page) {
      onNextPage();
    } else {
      onPreviousPage();
    }
  };

  const renderTablePagination = () => {
    if (!hasNextPage && !hasPreviousPage) {
      // no pagination needed
      return null;
    }

    if (loading) {
      return (
        <div className={classes.spinner}>
          <Spinner size={24} />
        </div>
      );
    }

    return (
      <TablePagination
        component="div"
        colSpan={colSpan}
        count={count}
        labelDisplayedRows={Function.prototype}
        rowsPerPage={pageSize}
        rowsPerPageOptions={[pageSize]}
        page={page}
        backIconButtonProps={{
          'aria-label': 'Previous Page',
        }}
        nextIconButtonProps={{
          'aria-label': 'Next Page',
        }}
        onPageChange={handlePageChange}
      />
    );
  };

  const renderRows = () => {
    if (lazyRender) {
      return (
        <WindowScroller>
          {({ height, isScrolling, onChildScroll, scrollTop }) => (
            <AutoSizer disableHeight>
              {({ width }) => (
                <List
                  width={width}
                  height={height}
                  autoHeight
                  isScrolling={isScrolling}
                  onScroll={onChildScroll}
                  scrollTop={scrollTop}
                  rowCount={rows.length}
                  rowHeight={rowHeight}
                  rowRenderer={({ index, style, key }) =>
                    renderRow(rows[index], style, key)
                  }
                />
              )}
            </AutoSizer>
          )}
        </WindowScroller>
      );
    }

    return rows.map((row, index) => renderRow(row, null, index));
  };

  return (
    <Fragment>
      {!withoutTopPagination && renderTablePagination()}
      {showFilter && (
        <TextField
          className={classes.filter}
          hiddenLabel
          size="small"
          name="filter"
          variant="outlined"
          placeholder={`Filter ${items.length} rows..`}
          onChange={e => setFilterValue(e.target.value)}
          value={filterValue}
          InputProps={{
            startAdornment: (
              <InputAdornment position="start">
                <FilterIcon />
              </InputAdornment>
            ),
          }}
        />
      )}
      <div className={classes.tableWrapper}>
        <Table size={size}>
          {headers && (
            <TableHead>
              <TableRow
                classes={{
                  head: classNames({
                    [classes.thWithTopPagination]: !withoutTopPagination,
                  }),
                }}>
                {headers.map(header => (
                  <TableCell key={`table-header-${header}`}>
                    <TableSortLabel
                      className={classes.sortHeader}
                      id={header}
                      active={header === sortByHeader}
                      direction={sortDirection || 'desc'}
                      onClick={() => onHeaderClick?.(header)}>
                      {header}
                    </TableSortLabel>
                  </TableCell>
                ))}
              </TableRow>
            </TableHead>
          )}
          <TableBody>
            {rows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={colSpan}>
                  <em>
                    {searchTerm || filterValue
                      ? `No items for this page with search term ${
                          searchTerm || filterValue
                        }.`
                      : noItemsMessage}
                  </em>
                </TableCell>
              </TableRow>
            ) : (
              renderRows()
            )}
          </TableBody>
        </Table>
      </div>
      {renderTablePagination()}
    </Fragment>
  );
}

PaginatedDataTable.propTypes = {
  /** One page of items. */
  items: array.isRequired,
  /**
   * A function to execute for each row to render in the table.
   * Will be passed a single item, and -- when `lazyRender` is set -- the style
   * and key react-virtualized needs on the row.
   */
  renderRow: func.isRequired,
  /** The maximum number of records displayed per page. */
  pageSize: number.isRequired,
  /** The zero-based index of the page currently displayed. */
  page: number.isRequired,
  /** Whether the page currently displayed is still being fetched. */
  loading: bool,
  hasNextPage: bool,
  hasPreviousPage: bool,
  /** Called when the user asks for the next page. */
  onNextPage: func.isRequired,
  /** Called when the user asks for the previous page. */
  onPreviousPage: func.isRequired,
  /**
   * The number of columns the table contains.
   * Not required when the `headers` prop is provided.
   */
  columnsSize: number,
  /** A list of header names to use on the table starting from the left. */
  headers: arrayOf(string),
  /** A header name to sort on. */
  sortByHeader: string,
  /** The sorting direction. */
  sortDirection: oneOf(['desc', 'asc']),
  /**
   * A function to execute when a column header is clicked.
   * Will receive the header name, which can be used to handle sorting.
   */
  onHeaderClick: func,
  /**
   * If true, the pagination component is only displayed below the table.
   */
  withoutTopPagination: bool,
  /** A message to display when there are no items to display. */
  noItemsMessage: string,
  /** A search term used to refine the list of results. */
  searchTerm: string,
  /** Allows TableCells to inherit size of the Table. */
  size: oneOf(['small', 'medium']),
  /** Allow custom filtering of rows. */
  allowFilter: bool,
  /** Function to filter rows. */
  filterFunc: func,
  /**
   * Only render rows that are visible in the viewport.
   *
   * This currently works on single column tables (lists); rendering of
   * multiple columns will be out of sync with header widths.
   */
  lazyRender: bool,
  /** Height in pixels of a single row. */
  rowHeight: number,
};
