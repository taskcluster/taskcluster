import React, { Fragment, Component } from 'react';
import { string, arrayOf, shape, bool } from 'prop-types';
import classNames from 'classnames';
import { pipe, map, sort as rSort } from 'ramda';
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
import { memoize } from '../../utils/memoize';
import StatusLabel from '../StatusLabel';
import Link from '../../utils/Link';
import sort from '../../utils/sort';
import {
  filterTasks,
  taskLastRun,
  taskRunDurationInMs,
} from '../../utils/task';
import { pageInfo, task, taskState } from '../../utils/prop-types';
import TimeDiff from '../Duration';
import DateDistance from '../DateDistance';

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
  const lastRun = taskLastRun(node);
  const mapping = {
    Status: node.status.state,
    Name: node.metadata.name,
    Duration: taskRunDurationInMs(lastRun),
    Started: lastRun?.from,
    Resolved: lastRun?.to,
  };

  return mapping[sortBy];
};

const ItemRenderer = ({ data, index, style }) => {
  const { items, classes, showTimings, iconSize } = data;
  const taskGroup = items[index].node;
  const run = taskLastRun(taskGroup);

  return (
    <TableRow
      style={style}
      className={classes.tableRow}
      component="div"
      role="row">
      <TableCell
        size="small"
        className={
          showTimings ? classes.tableFirstShortCell : classes.tableFirstCell
        }
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
      {showTimings && (
        <TableCell
          size="small"
          className={classes.tableTimeCell}
          component="div"
          role="cell">
          <abbr title={run?.from}>
            {run?.from ? <DateDistance from={run.from} /> : 'n/a'}
          </abbr>
        </TableCell>
      )}
      {showTimings && (
        <TableCell
          size="small"
          className={classes.tableTimeCell}
          component="div"
          role="cell">
          <abbr title={run?.to}>
            {run?.to ? <DateDistance from={run.to} /> : 'n/a'}
          </abbr>
        </TableCell>
      )}
      <TableCell
        size="small"
        className={classes.tableSecondCell}
        component="div"
        role="cell">
        <span>
          {run ? <TimeDiff from={run.from} offset={run.to} /> : 'n/a'}
        </span>
      </TableCell>
      <TableCell
        size="small"
        className={classes.tableThirdCell}
        component="div"
        role="cell">
        <span>
          <StatusLabel state={taskGroup.status.state} />
        </span>
      </TableCell>
    </TableRow>
  );
};

const ItemRendererMemo = React.memo(ItemRenderer);

@withStyles(theme => ({
  listItemCell: {
    display: 'flex',
    width: '100%',
    alignItems: 'center',
    padding: theme.spacing(1),
    textDecoration: 'none',
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
    width: '12%',
  },
  tableTimingHeadCell: {
    display: 'flex',
    flex: 1,
    justifyContent: 'flex-end',
    width: '12%',
    [theme.breakpoints.down('md')]: {
      display: 'none',
    },
  },
  tableThirdHeadCell: {
    display: 'flex',
    flex: 1,
    justifyContent: 'flex-end',
    width: '12%',
  },
  tableRow: {
    display: 'flex',
    ...theme.mixins.hover,
  },
  tableFirstCell: {
    width: '76%',
  },
  tableFirstShortCell: {
    width: '52%',
    [theme.breakpoints.down('md')]: {
      width: '76%',
    },
  },
  tableSecondCell: {
    display: 'flex',
    justifyContent: 'flex-end',
    alignItems: 'flex-end',
    width: '12%',
    paddingRight: theme.spacing(4),
  },
  tableTimeCell: {
    display: 'flex',
    justifyContent: 'flex-end',
    alignItems: 'flex-end',
    width: '12%',
    paddingRight: theme.spacing(2),
    '& abbr': {
      textDecoration: 'none',
    },
    [theme.breakpoints.down('md')]: {
      display: 'none',
    },
  },
  tableThirdCell: {
    display: 'flex',
    justifyContent: 'flex-end',
    alignItems: 'center',
    width: '12%',
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
      edges: arrayOf(task),
      pageInfo,
    }).isRequired,
    /** A task state filter to narrow down results. */
    filter: taskState,
    /** A task name search term to narrow down results. */
    searchTerm: string,
    /** Show start & resolved timings */
    showTimings: bool,
  };

  state = {
    sortBy: 'Name',
    sortDirection: 'asc',
  };

  static getDerivedStateFromProps() {
    return {
      windowHeight: window.innerHeight,
    };
  }

  createSortedTasks = memoize(
    (tasks, sortBy, sortDirection, filter, searchTerm) => {
      const filteredTasks = filterTasks(tasks, filter, searchTerm);

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
      maxSize: 2,
      serializer: ([tasks, sortBy, sortDirection, filter, searchTerm]) =>
        `${
          tasks ? sorted(tasks) : ''
        }-${sortBy}-${sortDirection}-${filter}-${searchTerm}`,
    }
  );

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
    const { sortBy, sortDirection } = this.state;
    const { classes, filter, searchTerm, showTimings } = this.props;
    const tasks = this.props.taskGroupConnection.edges;
    const iconSize = 16;
    const items = this.createSortedTasks(
      tasks,
      sortBy,
      sortDirection,
      filter,
      searchTerm ? searchTerm.toLowerCase() : ''
    );
    const itemCount = items.length;

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
                  showTimings
                    ? classes.tableFirstShortCell
                    : classes.tableFirstCell,
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
              {showTimings && (
                <TableCell
                  size="small"
                  component="div"
                  role="columnheader"
                  className={classes.tableTimingHeadCell}>
                  <TableSortLabel
                    className={classes.tableHeadCell}
                    id="Started"
                    active={sortBy === 'Started'}
                    direction={sortDirection || 'desc'}
                    onClick={this.handleHeaderClick}>
                    Started
                  </TableSortLabel>
                </TableCell>
              )}
              {showTimings && (
                <TableCell
                  size="small"
                  component="div"
                  role="columnheader"
                  className={classes.tableTimingHeadCell}>
                  <TableSortLabel
                    className={classes.tableHeadCell}
                    id="Resolved"
                    active={sortBy === 'Resolved'}
                    direction={sortDirection || 'desc'}
                    onClick={this.handleHeaderClick}>
                    Resolved
                  </TableSortLabel>
                </TableCell>
              )}
              <TableCell
                size="small"
                component="div"
                role="columnheader"
                className={classes.tableSecondHeadCell}>
                <TableSortLabel
                  className={classes.tableHeadCell}
                  id="Duration"
                  active={sortBy === 'Duration'}
                  direction={sortDirection || 'desc'}
                  onClick={this.handleHeaderClick}>
                  Duration
                </TableSortLabel>
              </TableCell>
              <TableCell
                size="small"
                component="div"
                role="columnheader"
                className={classes.tableThirdHeadCell}>
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
              overscanCount={50}
              itemData={{ iconSize, items, showTimings, classes }}
              itemKey={(index, data) => data.items[index]?.node.taskId}>
              {ItemRendererMemo}
            </List>
          </Fragment>
        ) : (
          <Typography variant="body2" className={classes.noTasksText}>
            No
            {filter ? ` ${filter.toLowerCase()}` : ''} tasks available
          </Typography>
        )}
      </div>
    );
  }
}
