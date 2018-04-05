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

  state = {
    loading: false,
  };

  handlePageChange = (e, nextPage) => {
    const { connection, onPageChange } = this.props;
    const { page } = this.getPaginationMetadata();
    const { pageInfo } = connection;

    this.setState({ loading: true }, async () => {
      await onPageChange({
        cursor: nextPage > page ? pageInfo.nextCursor : pageInfo.previousCursor,
        previousCursor: pageInfo.cursor,
      });
      this.setState({ loading: false });
    });
  };

  getPaginationMetadata() {
    const { connection, pageSize } = this.props;
    const { pageInfo } = connection;

    if (pageInfo.hasNextPage && pageInfo.hasPreviousPage) {
      return {
        count: pageSize * 3,
        page: 1,
      };
    } else if (pageInfo.hasNextPage) {
      return {
        count: pageSize * 2,
        page: 0,
      };
    } else if (pageInfo.hasPreviousPage) {
      return {
        count: pageSize * 2,
        page: 1,
      };
    }

    return {
      count: pageSize,
      page: 0,
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
