import React, { Component, Fragment } from 'react';
import {
  array,
  arrayOf,
  func,
  number,
  shape,
  string,
  oneOf,
  bool,
} from 'prop-types';
import classNames from 'classnames';
import { withStyles } from '@material-ui/core/styles';
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
import Spinner from '../Spinner';
import { pageInfo } from '../../utils/prop-types';

@withStyles(theme => ({
  loading: {
    textAlign: 'right',
  },
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
}))
/**
 * A paginated table that operates on a GraphQL PageConnection.
 */
export default class ConnectionDataTable extends Component {
  static propTypes = {
    /**
     * A message to display when there is no items to display.
     */
    noItemsMessage: string,
    /** A search term to refine the list of results. */
    searchTerm: string,
    /**
     * A GraphQL PageConnection instance.
     */
    connection: shape({
      edges: array,
      pageInfo,
    }).isRequired,
    /**
     * The maximum number of records to display per page.
     */
    pageSize: number.isRequired,
    /**
     * The number of columns the table contains.
     * This property is not required when the `headers` prop is provided.
     */
    columnsSize: number,
    /**
     * A function to execute for each row to render in the table.
     * Will be passed a single edge from the connection. The function
     * should return the JSX necessary to render the given edge row.
     */
    renderRow: func.isRequired,
    /**
     * A function to execute when paging. Will receive a single argument
     * which is an object in the form of `{ cursor, previousCursor }`. This
     * can be used to query the next/previous set in a page connection. Should
     * return a Promise which waits for the next page connection.
     */
    onPageChange: func.isRequired,
    /**
     * A function to execute when a column header is clicked.
     * Will receive a single argument which is the column name.
     * This can be used to handle sorting.
     */
    onHeaderClick: func,
    /**
     * A header name to sort on.
     */
    sortByHeader: string,
    /**
     * The sorting direction.
     */
    sortDirection: oneOf(['desc', 'asc']),
    /**
     * A list of header names to use on the table starting from the left.
     */
    headers: arrayOf(string),
    /**
     * If true, an additional pagination component will be displayed
     * at the top of the table.
     */
    withoutTopPagination: bool,
    /**
     * Allows TableCells to inherit size of the Table.
     */
    size: oneOf(['small', 'medium']),
    /**
     * Allow custom filtering of rows
     */
    allowFilter: bool,
    /**
     * Function to filter rows
     */
    filterFunc: func,
  };

  static defaultProps = {
    columnsSize: null,
    sortByHeader: null,
    sortDirection: 'desc',
    headers: null,
    onHeaderClick: null,
    withoutTopPagination: false,
    size: 'small',
    noItemsMessage: 'No items for this page.',
    searchTerm: null,
    allowFilter: false,
    filterFunc: null,
  };

  state = {
    loading: false,
    page: 0,
    filterValue: '',
  };

  pages = new Map();

  componentDidUpdate(prevProps) {
    if (
      !this.props.connection.pageInfo.previousCursor &&
      prevProps.connection.pageInfo.previousCursor
    ) {
      // eslint-disable-next-line react/no-did-update-set-state
      this.setState({ page: 0 });
    }
  }

  getPaginationMetadata() {
    const { connection, pageSize } = this.props;
    const { page } = this.state;

    this.pages.set(connection.pageInfo.cursor, {
      pageInfo: connection.pageInfo,
    });

    const { pageInfo } = this.pages.get(connection.pageInfo.cursor);

    return {
      count: (page + 1) * pageSize + (pageInfo.hasNextPage ? 1 : 0) * pageSize,
    };
  }

  handleHeaderClick = header => {
    const { onHeaderClick } = this.props;

    if (onHeaderClick) {
      onHeaderClick(header);
    }
  };

  handlePageChange = (e, nextPage) => {
    const { connection, onPageChange } = this.props;
    const { page } = this.state;

    if (!this.pages.has(connection.pageInfo.cursor)) {
      return;
    }

    const newPage = nextPage > page ? page + 1 : page - 1;
    const { pageInfo } = this.pages.get(connection.pageInfo.cursor);
    const cursor =
      nextPage > page ? pageInfo.nextCursor : pageInfo.previousCursor;
    const previousCursor =
      nextPage > page
        ? pageInfo.cursor
        : this.pages.get(pageInfo.previousCursor).pageInfo.previousCursor;

    this.setState({ loading: true, page: newPage }, async () => {
      await onPageChange({ cursor, previousCursor });
      this.setState({ loading: false });
    });
  };

  handleFilterValueChange = e => {
    this.setState({ filterValue: e.target.value });
  };

  renderTablePagination = (colSpan, count) => {
    const { classes, connection, pageSize } = this.props;
    const { loading, page } = this.state;

    if (
      !connection?.pageInfo?.hasNextPage &&
      !connection?.pageInfo?.hasPreviousPage
    ) {
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
        onChangePage={this.handlePageChange}
      />
    );
  };

  render() {
    const {
      classes,
      columnsSize,
      connection,
      renderRow,
      headers,
      sortByHeader,
      sortDirection,
      withoutTopPagination,
      noItemsMessage,
      searchTerm,
      size,
      allowFilter,
      filterFunc,
    } = this.props;
    const { count } = this.getPaginationMetadata();
    const colSpan = columnsSize || (headers && headers.length) || 1;
    const { filterValue } = this.state;
    const { edges } = connection;
    const rows =
      allowFilter && filterFunc
        ? edges.filter(row => filterFunc(row, filterValue))
        : edges;
    const showFilter = allowFilter && edges.length > 10;

    return (
      <Fragment>
        {!withoutTopPagination && this.renderTablePagination(colSpan, count)}
        {showFilter && (
          <TextField
            className={classes.filter}
            hiddenLabel
            size="small"
            name="filter"
            variant="outlined"
            placeholder={`Filter ${edges.length} rows..`}
            onChange={this.handleFilterValueChange}
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
                        onClick={() => this.handleHeaderClick(header)}>
                        {header}
                      </TableSortLabel>
                    </TableCell>
                  ))}
                </TableRow>
              </TableHead>
            )}
            <TableBody>
              {edges.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={colSpan}>
                    <em>
                      {searchTerm
                        ? `No items for this page with search term ${searchTerm}.`
                        : noItemsMessage}
                    </em>
                  </TableCell>
                </TableRow>
              ) : (
                rows.map(renderRow)
              )}
            </TableBody>
          </Table>
        </div>
        {this.renderTablePagination(colSpan, count)}
      </Fragment>
    );
  }
}
