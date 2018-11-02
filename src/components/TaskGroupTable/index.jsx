import React, { Fragment, Component } from 'react';
import { arrayOf, oneOf, shape } from 'prop-types';
import { Link } from 'react-router-dom';
import { pipe, map, sort as rSort } from 'ramda';
import { lowerCase } from 'change-case';
import memoize from 'fast-memoize';
import { FixedSizeList as List } from 'react-window';
import { withStyles } from '@material-ui/core/styles';
import TableRow from '@material-ui/core/TableRow';
import TableCell from '@material-ui/core/TableCell';
import Typography from '@material-ui/core/Typography';
import Table from '@material-ui/core/Table';
import TableSortLabel from '@material-ui/core/TableSortLabel';
import TableHead from '@material-ui/core/TableHead';
import LinkIcon from 'mdi-react/LinkIcon';
import StatusLabel from '../StatusLabel';
import sort from '../../utils/sort';
import { TASK_STATE } from '../../utils/constants';
import { pageInfo, client } from '../../utils/prop-types';

const sorted = pipe(
  rSort((a, b) => sort(a.node.metadata.name, b.node.metadata.name)),
  map(
    ({
      node: {
        metadata: { name },
        status: { state },
      },
    }) => `${name}-${state}`
  )
);

const valueFromNode = (node, sortBy) => {
  const mapping = {
    Status: node.status.state,
    Name: node.metadata.name,
  };

  return mapping[sortBy];
};

const createSortedTasks = memoize(
  (tasks, sortBy, sortDirection, filter) => {
    const filteredTasks = filter
      ? tasks.filter(({ node: { status: { state } } }) =>
          filter.includes(state)
        )
      : tasks;

    if (!sortBy) {
      return filteredTasks;
    }

    return filteredTasks.sort((a, b) => {
      const firstElement =
        sortDirection === 'desc'
          ? valueFromNode(b.node, sortBy)
          : valueFromNode(a.node, sortBy);
      const secondElement =
        sortDirection === 'desc'
          ? valueFromNode(a.node, sortBy)
          : valueFromNode(b.node, sortBy);

      return sort(firstElement, secondElement);
    });
  },
  {
    serializer: ([tasks, sortBy, sortDirection, filter]) =>
      `${tasks ? sorted(tasks) : ''}-${sortBy}-${sortDirection}-${filter}`,
  }
);

@withStyles(theme => ({
  tableCell: {
    textDecoration: 'none',
  },
  listItemCell: {
    display: 'flex',
    width: '100%',
    padding: theme.spacing.unit,
    ...theme.mixins.hover,
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
  table: {
    marginTop: theme.spacing.double,
    marginBottom: theme.spacing.unit,
  },
  tableHead: {
    display: 'flex',
  },
  tableHeadRow: {
    flex: 1,
    display: 'flex',
    alignItems: 'center',
    height: theme.spacing.unit * 4,
    '& > th': {
      paddingBottom: theme.spacing.double,
    },
  },
  tableHeadCell: {
    flexDirection: 'row',
  },
  tableRow: {
    display: 'flex',
  },
  tableFirstCell: {
    flex: 1,
  },
  tableSecondCell: {
    flex: 0.5,
    display: 'flex',
    flexGrow: 0,
    flexDirection: 'column',
    justifyContent: 'center',
  },
  noTasksText: {
    marginTop: theme.spacing.double,
  },
}))
export default class TaskGroupTable extends Component {
  static defaultProps = {
    filter: '',
  };

  static propTypes = {
    /** Task GraphQL PageConnection instance. */
    // eslint-disable-next-line react/no-unused-prop-types
    taskGroupConnection: shape({
      edges: arrayOf(client),
      pageInfo,
    }).isRequired,
    /** A task state filter to narrow down results */
    filter: oneOf(Object.values(TASK_STATE)),
  };

  state = {
    sortBy: null,
    sortDirection: null,
    tasks: [],
  };

  static getDerivedStateFromProps(props) {
    const { taskGroupConnection } = props;

    if (!taskGroupConnection.pageInfo.hasNextPage) {
      return {
        tasks: [...taskGroupConnection.edges],
        windowHeight: window.innerHeight,
      };
    }

    return null;
  }

  handleHeaderClick = ({ target }) => {
    const sortBy = target.id;
    const toggled = this.state.sortDirection === 'desc' ? 'asc' : 'desc';
    const sortDirection = this.state.sortBy === sortBy ? toggled : 'desc';

    this.setState({ sortBy, sortDirection });
  };

  render() {
    const { sortBy, sortDirection, tasks } = this.state;
    const { classes, filter } = this.props;
    const iconSize = 16;
    const windowHeight = window.innerHeight;
    const tableHeight = windowHeight > 400 ? 0.6 * windowHeight : 400;
    const items = createSortedTasks(tasks, sortBy, sortDirection, filter);
    const itemCount = items.length;

    const ItemRenderer = ({ index, style }) => {
      const taskGroup = items[index].node;

      return (
        <TableRow style={style} className={classes.tableRow}>
          <TableCell padding="dense" className={classes.tableFirstCell}>
            <Link
              className={classes.tableCell}
              to={`/tasks/${taskGroup.status.taskId}`}
            >
              <div className={classes.listItemCell}>
                <Typography className={classes.taskGroupName}>
                  {taskGroup.metadata.name}
                </Typography>
                <LinkIcon size={iconSize} />
              </div>
            </Link>
          </TableCell>
          <TableCell className={classes.tableSecondCell}>
            <StatusLabel state={taskGroup.status.state} />
          </TableCell>
        </TableRow>
      );
    };

    return (
      <Fragment>
        <Table className={classes.table}>
          <TableHead className={classes.tableHead}>
            <TableRow className={classes.tableHeadRow}>
              <TableCell className={classes.tableFirstCell}>
                <TableSortLabel
                  id="Name"
                  active={sortBy === 'Name'}
                  direction={sortDirection || 'desc'}
                  onClick={this.handleHeaderClick}
                >
                  Name
                </TableSortLabel>
              </TableCell>
              <TableCell>
                <TableSortLabel
                  id="Status"
                  active={sortBy === 'Status'}
                  direction={sortDirection || 'desc'}
                  onClick={this.handleHeaderClick}
                >
                  Status
                </TableSortLabel>
              </TableCell>
            </TableRow>
          </TableHead>
        </Table>
        {itemCount ? (
          <List height={tableHeight} itemCount={items.length} itemSize={48}>
            {ItemRenderer}
          </List>
        ) : (
          <Typography className={classes.noTasksText}>
            No
            {filter ? ` ${lowerCase(filter)}` : ''} tasks available
          </Typography>
        )}
      </Fragment>
    );
  }
}
