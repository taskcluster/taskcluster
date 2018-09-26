import { Component } from 'react';
import { bool, func, shape, arrayOf, string } from 'prop-types';
import { graphql } from 'react-apollo';
import dotProp from 'dot-prop-immutable';
import memoize from 'fast-memoize';
import { equals, pipe, filter, map, sort as rSort } from 'ramda';
import { lowerCase, title } from 'change-case';
import { withStyles } from '@material-ui/core/styles';
import classNames from 'classnames';
import amber from '@material-ui/core/colors/amber';
import blue from '@material-ui/core/colors/blue';
import grey from '@material-ui/core/colors/grey';
import green from '@material-ui/core/colors/green';
import Typography from '@material-ui/core/Typography';
import Grid from '@material-ui/core/Grid';
import ButtonBase from '@material-ui/core/ButtonBase';
import CheckIcon from 'mdi-react/CheckIcon';
import ClockOutlineIcon from 'mdi-react/ClockOutlineIcon';
import CalendarClockIcon from 'mdi-react/CalendarClockIcon';
import AlertCircleOutlineIcon from 'mdi-react/AlertCircleOutlineIcon';
import CloseIcon from 'mdi-react/CloseIcon';
import AutorenewIcon from 'mdi-react/AutorenewIcon';
import PlaylistRemoveIcon from 'mdi-react/PlaylistRemoveIcon';
import { task, pageInfo, taskState } from '../../utils/prop-types';
import {
  TASK_GROUP_PROGRESS_SIZE,
  TASK_GROUP_POLLING_INTERVAL,
  TASK_STATE,
  THEME,
  INITIAL_CURSOR,
} from '../../utils/constants';
import taskGroupCompactQuery from './taskGroupCompact.graphql';
import sort from '../../utils/sort';

const sorted = pipe(
  filter(taskGroup => taskGroup.node.metadata.name),
  rSort((a, b) => sort(a.node.metadata.name, b.node.metadata.name)),
  map(
    ({
      node: {
        metadata: { name },
      },
    }) => name
  )
);
const initialStatusCount = {
  completed: 0,
  failed: 0,
  exception: 0,
  running: 0,
  pending: 0,
  unscheduled: 0,
};
let previousCursor;
const getStatusCount = memoize(
  taskGroupCompactEdges => {
    const statusCount = { ...initialStatusCount };

    taskGroupCompactEdges &&
      taskGroupCompactEdges.forEach(({ node: { status: { state } } }) => {
        switch (state) {
          case TASK_STATE.COMPLETED: {
            statusCount.completed += 1;
            break;
          }

          case TASK_STATE.FAILED: {
            statusCount.failed += 1;
            break;
          }

          case TASK_STATE.EXCEPTION: {
            statusCount.exception += 1;
            break;
          }

          case TASK_STATE.UNSCHEDULED: {
            statusCount.unscheduled += 1;
            break;
          }

          case TASK_STATE.RUNNING: {
            statusCount.running += 1;
            break;
          }

          case TASK_STATE.PENDING: {
            statusCount.pending += 1;
            break;
          }

          default: {
            break;
          }
        }
      });

    return statusCount;
  },
  {
    serializer: taskGroupCompactEdges => sorted(taskGroupCompactEdges),
  }
);

@graphql(taskGroupCompactQuery, {
  options: props => ({
    pollInterval: TASK_GROUP_POLLING_INTERVAL,
    variables: {
      taskGroupId: props.taskGroupId,
      taskGroupConnection: {
        limit: TASK_GROUP_PROGRESS_SIZE,
      },
    },
  }),
})
@withStyles(theme => ({
  statusButton: {
    display: 'flex',
    flexGrow: 1,
    flexBasis: 0,
    padding: `${theme.spacing.unit}px ${theme.spacing.unit}px`,
    justifyContent: 'space-around',
    cursor: 'pointer',
    margin: theme.spacing.unit,
    '&:disabled': {
      backgroundColor: theme.palette.action.disabledBackground,
      color: theme.palette.action.disabled,
    },
    '& > div': {
      display: 'flex',
      flexDirection: 'column',
      width: '100%',
    },
  },
  statusButtonTypography: {
    color: THEME.PRIMARY_TEXT_DARK,
  },
  statusButtonTypographyDisabled: {
    color: 'currentColor',
  },
  statusTitle: {
    textAlign: 'right',
  },
  statusIcon: {
    fill: THEME.PRIMARY_TEXT_DARK,
  },
  completedButton: {
    backgroundColor: theme.palette.success.dark,
    '&:hover': {
      backgroundColor: green[900],
    },
  },
  failedButton: {
    backgroundColor: theme.palette.error.main,
    '&:hover': {
      backgroundColor: theme.palette.error.dark,
    },
  },
  unscheduledButton: {
    backgroundColor: grey[600],
    '&:hover': {
      backgroundColor: grey[800],
    },
  },
  pendingButton: {
    backgroundColor: grey[600],
    '&:hover': {
      backgroundColor: grey[800],
    },
  },
  exceptionButton: {
    backgroundColor: theme.palette.warning.dark,
    '&:hover': {
      backgroundColor: amber[900],
    },
  },
  runningButton: {
    backgroundColor: blue[700],
    '&:hover': {
      backgroundColor: blue[900],
    },
  },
}))
export default class TaskGroupProgress extends Component {
  static propTypes = {
    /** The task group ID being inspected. */
    taskGroupId: string.isRequired,
    /** The selected task state. This will change the card icon. */
    filter: taskState,
    /** Callback fired when the a state card is clicked */
    onStatusClick: func.isRequired,
    /** Callback fired when the status counts has been calculated. */
    onCountUpdate: func,
    /** A Task GraphQL PageConnection instance. */
    taskGroup: shape({
      pageInfo,
      edges: arrayOf(task),
    }),
    /** If true, the state cards will be disabled. */
    disabled: bool,
  };

  static defaultProps = {
    taskGroup: null,
    filter: null,
    disabled: false,
  };

  state = {
    statusCount: initialStatusCount,
  };

  constructor(props) {
    super(props);

    previousCursor = INITIAL_CURSOR;
  }

  /* eslint-disable react/no-did-update-set-state */
  componentDidUpdate(prevProps) {
    const {
      onCountUpdate,
      taskGroupId,
      data: { taskGroup, fetchMore, refetch },
    } = this.props;
    const { statusCount } = this.state;

    if (prevProps.taskGroupId !== taskGroupId) {
      previousCursor = INITIAL_CURSOR;
      this.setState({ statusCount: initialStatusCount });

      return refetch({
        pollInterval: TASK_GROUP_POLLING_INTERVAL,
        variables: {
          taskGroupId,
          taskGroupConnection: {
            limit: TASK_GROUP_PROGRESS_SIZE,
          },
        },
      });
    }

    const newStatusCount =
      taskGroup && taskGroup.edges ? getStatusCount(taskGroup.edges) : {};

    // We're done counting
    if (
      taskGroup &&
      !taskGroup.pageInfo.hasNextPage &&
      !equals(statusCount, newStatusCount)
    ) {
      this.setState({ statusCount: newStatusCount });
      previousCursor = INITIAL_CURSOR;

      return onCountUpdate();
    }

    if (taskGroup && previousCursor === taskGroup.pageInfo.cursor) {
      fetchMore({
        variables: {
          taskGroupId,
          taskGroupCompactConnection: {
            limit: TASK_GROUP_PROGRESS_SIZE,
            cursor: taskGroup.pageInfo.nextCursor,
            previousCursor: taskGroup.pageInfo.cursor,
          },
        },
        updateQuery(previousResult, { fetchMoreResult, variables }) {
          if (
            variables.taskGroupCompactConnection.previousCursor ===
            previousCursor
          ) {
            const { edges, pageInfo } = fetchMoreResult.taskGroup;

            previousCursor = variables.taskGroupCompactConnection.cursor;

            if (!edges.length) {
              return previousResult;
            }

            const result = dotProp.set(previousResult, 'taskGroup', taskGroup =>
              dotProp.set(
                dotProp.set(
                  taskGroup,
                  'edges',
                  previousResult.taskGroup.edges.concat(edges)
                ),
                'pageInfo',
                pageInfo
              )
            );

            return result;
          }
        },
      });
    }
  }
  /* eslint-enable react/no-did-update-set-state */

  getStatusIcon = status => {
    if (this.props.filter === status) {
      return PlaylistRemoveIcon;
    }

    switch (status) {
      case TASK_STATE.COMPLETED: {
        return CheckIcon;
      }

      case TASK_STATE.EXCEPTION: {
        return AlertCircleOutlineIcon;
      }

      case TASK_STATE.RUNNING: {
        return AutorenewIcon;
      }

      case TASK_STATE.PENDING: {
        return ClockOutlineIcon;
      }

      case TASK_STATE.FAILED: {
        return CloseIcon;
      }

      case TASK_STATE.UNSCHEDULED: {
        return CalendarClockIcon;
      }

      default: {
        break;
      }
    }
  };

  render() {
    const { classes, onStatusClick, disabled } = this.props;
    const { statusCount } = this.state;
    const showDots = Object.values(statusCount).reduce((a, b) => a + b) === 0;

    return (
      <Grid container spacing={16}>
        {Object.keys(TASK_STATE).map(status => {
          const Icon = this.getStatusIcon(status);
          const count = showDots ? '...' : statusCount[lowerCase(status)];

          return (
            <ButtonBase
              disabled={disabled}
              centerRipple
              focusRipple
              key={status}
              name={status}
              variant="contained"
              onClick={onStatusClick}
              className={classNames(
                classes[`${lowerCase(status)}Button`],
                classes.statusButton
              )}>
              <div>
                <Icon color="white" className={classes.statusIcon} size={32} />
              </div>
              <div>
                <Typography
                  align="right"
                  className={classNames({
                    [classes.statusButtonTypography]: !disabled,
                    [classes.statusButtonTypographyDisabled]: disabled,
                  })}
                  variant="display1">
                  {count}
                </Typography>
                <Typography
                  className={classNames(classes.statusTitle, {
                    [classes.statusButtonTypography]: !disabled,
                    [classes.statusButtonTypographyDisabled]: disabled,
                  })}
                  variant="caption">
                  {title(status)}
                </Typography>
              </div>
            </ButtonBase>
          );
        })}
      </Grid>
    );
  }
}
