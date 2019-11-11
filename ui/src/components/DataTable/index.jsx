import React, { Component, Fragment } from 'react';
import {
  arrayOf,
  func,
  number,
  string,
  oneOf,
  oneOfType,
  object,
  shape,
  bool,
} from 'prop-types';
import { withStyles } from '@material-ui/core/styles';
import Table from '@material-ui/core/Table';
import TableBody from '@material-ui/core/TableBody';
import TableCell from '@material-ui/core/TableCell';
import TableHead from '@material-ui/core/TableHead';
import TableSortLabel from '@material-ui/core/TableSortLabel';
import TableRow from '@material-ui/core/TableRow';
import TablePagination from '@material-ui/core/TablePagination';

@withStyles(theme => ({
  tableWrapper: {
    overflowX: 'auto',
  },
  sortHeader: {
    color: theme.palette.text.secondary,
  },
}))
/**
 * A table to display a set of data elements.
 */
export default class DataTable extends Component {
  static propTypes = {
    /**
     * The number of columns the table contains.
     * */
    columnsSize: number,
    /**
     * A function to execute for each row to render in the table.
     * Will be passed a datum from the table data. The function
     * should return the JSX necessary to render the given row.
     */
    renderRow: func.isRequired,
    /**
     * A function to execute when a column header is clicked.
     * Will receive a single argument
     * which is the header object for the corresponding column.
     * This can be used to handle sorting.
     */
    onHeaderClick: func,
    /**
     * A header name to sort on.
     */
    sortByLabel: string,
    /**
     * The sorting direction.
     */
    sortDirection: oneOf(['desc', 'asc']),
    /**
     * A list of header objects to use on the table starting from the left.
     */
    headers: arrayOf(
      shape({
        /**
         * An identifier for the header.
         * This is used to identify, for example, which column was clicked.
         */
        id: string,
        /**
         * A string identifying the data type of the column contents
         * (e.g., 'string', 'object', 'number'). */
        type: string,
        /**
         * A label to use for the column name.
         */
        label: string,
      })
    ),
    /**
     * A list of objects or strings to display. Each element in
     * the list is represented by a row and each element represents a column.
     */
    items: arrayOf(oneOfType([object, string])).isRequired,
    /**
     * A message to display when there is no items to display.
     */
    noItemsMessage: string,
    /**
     * If true, the table will be paginated.
     */
    paginate: bool,
    /**
     * The number of rows per page.
     * Relevant if `paginate` is set to `true`.
     */
    rowsPerPage: number,
    /**
     * Allows TableCells to inherit size of the Table.
     */
    size: oneOf(['small', 'medium']),
  };

  static defaultProps = {
    columnsSize: null,
    headers: null,
    onHeaderClick: null,
    sortByLabel: null,
    sortDirection: 'desc',
    noItemsMessage: 'No items for this page.',
    paginate: false,
    rowsPerPage: 5,
    size: 'small',
  };

  state = {
    page: 0,
  };

  handleHeaderClick = header => {
    const { onHeaderClick } = this.props;

    if (onHeaderClick) {
      onHeaderClick(header);
    }
  };

  handlePageChange = (event, page) => {
    this.setState({ page });
  };

  render() {
    const {
      classes,
      items,
      columnsSize,
      renderRow,
      headers,
      sortByLabel,
      sortDirection,
      noItemsMessage,
      rowsPerPage,
      paginate,
      onHeaderClick,
      size,
      ...props
    } = this.props;
    const colSpan = columnsSize || (headers && headers.length) || 0;
    const { page } = this.state;
    const elements = paginate
      ? items.slice(page * rowsPerPage, page * rowsPerPage + rowsPerPage)
      : items;

    return (
      <Fragment>
        <div className={classes.tableWrapper}>
          <Table size={size} {...props}>
            {headers && (
              <TableHead>
                <TableRow>
                  {headers.map(header => (
                    <TableCell key={`table-header-${header.id}`}>
                      <TableSortLabel
                        className={classes.sortHeader}
                        active={header.id === sortByLabel}
                        direction={sortDirection || 'desc'}
                        onClick={() => this.handleHeaderClick(header)}>
                        {header.label}
                      </TableSortLabel>
                    </TableCell>
                  ))}
                </TableRow>
              </TableHead>
            )}
            <TableBody>
              {elements.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={colSpan}>
                    <em>{noItemsMessage}</em>
                  </TableCell>
                </TableRow>
              ) : (
                elements.map(renderRow)
              )}
            </TableBody>
          </Table>
        </div>
        {paginate && (
          <TablePagination
            labelDisplayedRows={() => ''}
            component="div"
            count={items.length}
            rowsPerPage={rowsPerPage}
            rowsPerPageOptions={[rowsPerPage]}
            page={page}
            backIconButtonProps={{
              'aria-label': 'Previous Page',
            }}
            nextIconButtonProps={{
              'aria-label': 'Next Page',
            }}
            onChangePage={this.handlePageChange}
          />
        )}
      </Fragment>
    );
  }
}
