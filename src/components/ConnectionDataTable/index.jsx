import { Component } from 'react';
import { array, func, number, shape } from 'prop-types';
import { withStyles } from 'material-ui/styles';
import Table, {
  TableBody,
  TableCell,
  TableFooter,
  TablePagination,
  TableRow,
} from 'material-ui/Table';
import Spinner from '../Spinner';
import { pageInfo } from '../../utils/prop-types';

@withStyles({
  loading: {
    textAlign: 'right',
  },
})
/**
 * A paginated table that operates on a GraphQL PageConnection.
 */
export default class ConnectionDataTable extends Component {
  static propTypes = {
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
     */
    columnsSize: number.isRequired,
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
  };

  pages = new Map();
  state = {
    loading: false,
  };

  handlePageChange = (e, nextPage) => {
    const { connection, onPageChange } = this.props;
    const { page, pageInfo } = this.pages.get(connection.pageInfo.cursor);
    const cursor =
      nextPage > page ? pageInfo.nextCursor : pageInfo.previousCursor;
    const previousCursor =
      nextPage > page
        ? pageInfo.cursor
        : this.pages.get(pageInfo.previousCursor).previousCursor;

    this.setState({ loading: true }, async () => {
      await onPageChange({ cursor, previousCursor });
      this.setState({ loading: false });
    });
  };

  getPaginationMetadata() {
    const { connection, pageSize } = this.props;

    if (!this.pages.has(connection.pageInfo.cursor)) {
      this.pages.set(connection.pageInfo.cursor, {
        page: this.pages.size,
        pageInfo: connection.pageInfo,
      });
    }

    const { page, pageInfo } = this.pages.get(connection.pageInfo.cursor);

    if (page === this.pages.size - 1) {
      return {
        page,
        count: pageInfo.hasNextPage
          ? (this.pages.size + 1) * pageSize
          : this.pages.size * pageSize,
      };
    }

    return {
      page,
      count: this.pages.size * pageSize,
    };
  }

  render() {
    const {
      classes,
      pageSize,
      columnsSize,
      connection,
      renderRow,
    } = this.props;
    const { loading } = this.state;
    const { count, page } = this.getPaginationMetadata();

    return (
      <Table>
        <TableBody>
          {connection.edges.length === 0 ? (
            <TableRow>
              <TableCell colSpan={columnsSize}>
                <em>No items for this page.</em>
              </TableCell>
            </TableRow>
          ) : (
            connection.edges.map(renderRow)
          )}
        </TableBody>
        <TableFooter>
          <TableRow>
            {loading ? (
              <TableCell colSpan={columnsSize} className={classes.loading}>
                <Spinner size={24} />
              </TableCell>
            ) : (
              <TablePagination
                colSpan={columnsSize}
                count={count}
                labelDisplayedRows={Function.prototype}
                rowsPerPage={pageSize}
                rowsPerPageOptions={[pageSize]}
                page={page}
                onChangePage={this.handlePageChange}
              />
            )}
          </TableRow>
        </TableFooter>
      </Table>
    );
  }
}
