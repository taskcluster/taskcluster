import React, { Fragment, Component } from 'react';
import { string, arrayOf, oneOf, shape } from 'prop-types';
import classNames from 'classnames';
import { curry, pipe, map, sort as rSort } from 'ramda';
import { lowerCase } from 'change-case';
import memoize from 'fast-memoize';
import { withStyles } from '@material-ui/core/styles';
import { FixedSizeList as List } from 'react-window';
import { WindowScroller } from 'react-virtualized';
import TableRow from '@material-ui/core/TableRow';
import TableCell from '@material-ui/core/TableCell';
import Typography from '@material-ui/core/Typography';
import Table from '@material-ui/core/Table';
import TableSortLabel from '@material-ui/core/TableSortLabel';
import TableHead from '@material-ui/core/TableHead';
import LinkIcon from 'mdi-react/LinkIcon';
import StatusLabel from '../StatusLabel';
import Link from '../../utils/Link';
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
        taskId,
      },
    }) => `${taskId}-${name}-${state}`
  )
);
const valueFromNode = (node, sortBy) => {
  const mapping = {
    Status: node.status.state,
    Name: node.metadata.name,
  };

  return mapping[sortBy];
};

const filterTasksByState = curry((filter, tasks) =>
  filter
    ? tasks.filter(({ node: { status: { state } } }) => filter.includes(state))
    : tasks
);
const filterTasksByName = curry((searchTerm, tasks) =>
  searchTerm
    ? tasks.filter(({ node: { metadata: { name } } }) =>
        lowerCase(name).includes(searchTerm)
      )
    : tasks
);
const createSortedTasks = memoize(
  (tasks, sortBy, sortDirection, filter, searchTerm) => {
    const filteredTasks = pipe(
      filterTasksByState(filter),
      filterTasksByName(searchTerm)
    )(tasks);

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
    serializer: ([tasks, sortBy, sortDirection, filter, searchTerm]) =>
      `${
        tasks ? sorted(tasks) : ''
      }-${sortBy}-${sortDirection}-${filter}-${searchTerm}`,
  }
);

@withStyles(theme => ({
  listItemCell: {
    display: 'flex',
    width: '100%',
    alignItems: 'center',
    padding: theme.spacing(1),
    textDecoration: 'none',
    ...theme.mixins.hover,
    ...theme.mixins.listItemButton,
  },
  taskGroupName: {
    marginRight: theme.spacing(1),
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    verticalAlign: 'middle',
    display: 'inline-block',
  },
  table: {
    marginBottom: theme.spacing(1),
  },
  tableHead: {
    display: 'flex',
  },
  tableHeadRow: {
    flex: 1,
    display: 'flex',
    alignItems: 'center',
    height: theme.spacing(4),
    '& > [role="columnheader"]': {
      paddingBottom: theme.spacing(1),
      paddingTop: theme.spacing(0.5),
    },
  },
  tableHeadCell: {
    color: theme.palette.text.secondary,
  },
  tableSecondHeadCell: {
    display: 'flex',
    flex: 1,
    justifyContent: 'flex-end',
  },
  tableRow: {
    display: 'flex',
  },
  tableFirstCell: {
    width: '60%',
  },
  tableSecondCell: {
    display: 'flex',
    justifyContent: 'flex-end',
    alignItems: 'center',
    width: '40%',
  },
  noTasksText: {
    marginTop: theme.spacing(2),
  },
  windowScrollerOverride: {
    height: '100% !important',
  },
}))
export default class TaskGroupTable extends Component {
  static defaultProps = {
    filter: '',
    searchTerm: '',
  };

  static propTypes = {
    /** Task GraphQL PageConnection instance. */
    // eslint-disable-next-line react/no-unused-prop-types
    taskGroupConnection: shape({
      edges: arrayOf(client),
      pageInfo,
    }).isRequired,
    /** A task state filter to narrow down results. */
    filter: oneOf(Object.values(TASK_STATE)),
    /** A task name search term to narrow down results. */
    searchTerm: string,
  };

  state = {
    sortBy: 'Name',
    sortDirection: 'asc',
    tasks: [],
  };

  static getDerivedStateFromProps(props) {
    const { taskGroupConnection } = props;

    return {
      tasks: [...taskGroupConnection.edges],
      windowHeight: window.innerHeight,
    };
  }

  handleHeaderClick = ({ target }) => {
    const sortBy = target.id;
    const toggled = this.state.sortDirection === 'desc' ? 'asc' : 'desc';
    const sortDirection = this.state.sortBy === sortBy ? toggled : 'desc';

    this.setState({ sortBy, sortDirection });
  };

  handleScroll = ({ scrollTop }) => {
    if (this.list) {
      this.list.scrollTo(scrollTop - 100);
    }
  };

  handleListRef = component => {
    this.list = component;
  };

  render() {
    const { sortBy, sortDirection, tasks } = this.state;
    const { classes, filter, searchTerm } = this.props;
    const iconSize = 16;
    const items = createSortedTasks(
      tasks,
      sortBy,
      sortDirection,
      filter,
      lowerCase(searchTerm)
    );
    const itemCount = items.length;
    const ItemRenderer = ({ index, style }) => {
      const taskGroup = items[index].node;

      return (
        <TableRow
          style={style}
          className={classes.tableRow}
          component="div"
          role="row">
          <TableCell
            size="small"
            className={classes.tableFirstCell}
            component="div"
            role="cell">
            <Link
              title={taskGroup.metadata.name}
              className={classes.listItemCell}
              to={`/tasks/${taskGroup.taskId}`}>
              <Typography variant="body2" className={classes.taskGroupName}>
                {taskGroup.metadata.name}
              </Typography>
              <span>
                <LinkIcon size={iconSize} />
              </span>
            </Link>
          </TableCell>
          <TableCell
            size="small"
            className={classes.tableSecondCell}
            component="div"
            role="cell">
            <span>
              <StatusLabel state={taskGroup.status.state} />
            </span>
          </TableCell>
        </TableRow>
      );
    };

    return (
      <div role="table">
        <Table className={classes.table} component="div">
          <TableHead
            className={classes.tableHead}
            component="div"
            role="rowgroup">
            <TableRow
              className={classes.tableHeadRow}
              component="div"
              role="row">
              <TableCell
                size="small"
                className={classNames(
                  classes.tableFirstCell,
                  classes.tableHeadCell
                )}
                component="div"
                role="columnheader">
                <TableSortLabel
                  id="Name"
                  active={sortBy === 'Name'}
                  direction={sortDirection || 'desc'}
                  onClick={this.handleHeaderClick}>
                  Name
                </TableSortLabel>
              </TableCell>
              <TableCell
                size="small"
                component="div"
                role="columnheader"
                className={classes.tableSecondHeadCell}>
                <TableSortLabel
                  className={classes.tableHeadCell}
                  id="Status"
                  active={sortBy === 'Status'}
                  direction={sortDirection || 'desc'}
                  onClick={this.handleHeaderClick}>
                  Status
                </TableSortLabel>
              </TableCell>
            </TableRow>
          </TableHead>
        </Table>
        {itemCount ? (
          <Fragment>
            <WindowScroller onScroll={this.handleScroll}>
              {() => null}
            </WindowScroller>
            <List
              ref={this.handleListRef}
              height={window.innerHeight}
              itemCount={itemCount}
              itemSize={48}
              className={classes.windowScrollerOverride}
              overscanCount={50}>
              {ItemRenderer}
            </List>
          </Fragment>
        ) : (
          <Typography variant="body2" className={classes.noTasksText}>
            No
            {filter ? ` ${lowerCase(filter)}` : ''} tasks available
          </Typography>
        )}
      </div>
    );
  }
}
