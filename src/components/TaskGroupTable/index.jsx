import { Component } from 'react';
import { arrayOf, func, shape } from 'prop-types';
import { Link } from 'react-router-dom';
import { pipe, map, sort as rSort } from 'ramda';
import memoize from 'fast-memoize';
import { withStyles } from '@material-ui/core/styles';
import TableRow from '@material-ui/core/TableRow';
import TableCell from '@material-ui/core/TableCell';
import LinkIcon from 'mdi-react/LinkIcon';
import TableCellListItem from '../TableCellListItem';
import ConnectionDataTable from '../ConnectionDataTable';
import StatusLabel from '../StatusLabel';
import sort from '../../utils/sort';
import { TASK_GROUP_PAGE_SIZE } from '../../utils/constants';
import { pageInfo, client } from '../../utils/prop-types';

const sorted = pipe(
  rSort((a, b) => sort(a.node.metadata.name, b.node.metadata.name)),
  map(
    ({
      node: {
        metadata: { name },
      },
    }) => name
  )
);

@withStyles(theme => ({
  listItemCell: {
    width: '100%',
  },
  taskGroupName: {
    marginRight: theme.spacing.unit,
    maxWidth: 500,
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    verticalAlign: 'middle',
    display: 'inline-block',
  },
}))
export default class TaskGroupTable extends Component {
  static propTypes = {
    /** Callback function fired when a page is changed. */
    onPageChange: func.isRequired,
    /** Task GraphQL PageConnection instance. */
    taskGroupConnection: shape({
      edges: arrayOf(client),
      pageInfo,
    }).isRequired,
  };

  state = {
    sortBy: null,
    sortDirection: null,
  };

  createSortedTaskGroupConnection = memoize(
    (taskGroupConnection, sortBy, sortDirection) => {
      if (!sortBy) {
        return taskGroupConnection;
      }

      return {
        ...taskGroupConnection,
        edges: [...taskGroupConnection.edges].sort((a, b) => {
          const firstElement =
            sortDirection === 'desc'
              ? this.valueFromNode(b.node)
              : this.valueFromNode(a.node);
          const secondElement =
            sortDirection === 'desc'
              ? this.valueFromNode(a.node)
              : this.valueFromNode(b.node);

          return sort(firstElement, secondElement);
        }),
      };
    },
    {
      serializer: ([taskGroupConnection, sortBy, sortDirection]) =>
        `${
          taskGroupConnection ? sorted(taskGroupConnection.edges) : ''
        }-${sortBy}-${sortDirection}`,
    }
  );

  valueFromNode(node) {
    const mapping = {
      Status: node.status.state,
      Name: node.metadata.name,
    };

    return mapping[this.state.sortBy];
  }

  handleHeaderClick = sortBy => {
    const toggled = this.state.sortDirection === 'desc' ? 'asc' : 'desc';
    const sortDirection = this.state.sortBy === sortBy ? toggled : 'desc';

    this.setState({ sortBy, sortDirection });
  };

  render() {
    const { sortBy, sortDirection } = this.state;
    const { classes, taskGroupConnection, onPageChange, ...props } = this.props;
    const connection = this.createSortedTaskGroupConnection(
      taskGroupConnection,
      sortBy,
      sortDirection
    );
    const iconSize = 16;

    return (
      <ConnectionDataTable
        headers={['Name', 'Status']}
        connection={connection}
        pageSize={TASK_GROUP_PAGE_SIZE}
        onPageChange={onPageChange}
        sortByHeader={sortBy}
        sortDirection={sortDirection}
        onHeaderClick={this.handleHeaderClick}
        renderRow={({ node: taskGroup }) => (
          <TableRow
            key={`task-group-${taskGroup.metadata.name}`}
            className={classes.listItemButton}>
            <TableCell>
              <TableCellListItem
                button
                component={Link}
                to={`/tasks/${taskGroup.status.taskId}`}>
                <div className={classes.taskGroupName}>
                  {taskGroup.metadata.name}
                </div>
                <LinkIcon size={iconSize} />
              </TableCellListItem>
            </TableCell>
            <TableCell>
              <StatusLabel state={taskGroup.status.state} />
            </TableCell>
          </TableRow>
        )}
        {...props}
      />
    );
  }
}
