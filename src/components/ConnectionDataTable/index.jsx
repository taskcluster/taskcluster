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
export default class ConnectionDataTable extends Component {
  static propTypes = {
    connection: shape({
      edges: array,
      pageInfo,
    }).isRequired,
    pageSize: number.isRequired,
    columnsSize: number.isRequired,
    renderRow: func.isRequired,
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
