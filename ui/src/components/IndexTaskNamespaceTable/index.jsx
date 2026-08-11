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
import { indexedTask, pagination } from '../../utils/prop-types';

const iconSize = 16;
const taskFromNamespace = namespace => namespace.split('.').slice(-1)[0];
const parentNamespace = namespace =>
  namespace.split('.').slice(0, -1).join('.');

/**
 * Display index task namespaces in a table.
 */
export default class IndexTaskNamespaceTable extends Component {
  static propTypes = {
    /** A page of indexed tasks. */
    tasks: arrayOf(indexedTask).isRequired,
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
      tasks,
      loading,
      page,
      hasNextPage,
      hasPreviousPage,
      onNextPage,
      onPreviousPage,
    } = this.props;
    const { sortBy, sortDirection } = this.state;
    const sortedTasks =
      sortBy === 'Name'
        ? [...tasks].sort((a, b) => {
            const first = taskFromNamespace(a.namespace);
            const second = taskFromNamespace(b.namespace);

            return sortDirection === 'desc'
              ? sort(second, first)
              : sort(first, second);
          })
        : tasks;

    return (
      <PaginatedDataTable
        items={sortedTasks}
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
        headers={['Name', 'Task Group']}
        renderRow={({ namespace }) => (
          <TableRow key={namespace}>
            <TableCell>
              <Link
                to={`/tasks/index/${encodeURIComponent(
                  parentNamespace(namespace)
                )}/${taskFromNamespace(namespace)}`}>
                <TableCellItem button>
                  {taskFromNamespace(namespace)}
                  <LinkIcon size={iconSize} />
                </TableCellItem>
              </Link>
            </TableCell>
            <TableCell size="medium">
              <Link
                to={`/tasks/index/${encodeURIComponent(
                  parentNamespace(namespace)
                )}/${taskFromNamespace(namespace)}/task-group`}>
                <TableCellItem button>
                  Task Group
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
