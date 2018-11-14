import React, { Component } from 'react';
import { func, shape, arrayOf, string } from 'prop-types';
import memoize from 'fast-memoize';
import { pipe, filter, map, sort as rSort } from 'ramda';
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
import { TASK_STATE, THEME } from '../../utils/constants';
import sort from '../../utils/sort';

const sorted = pipe(
  filter(taskGroup => taskGroup.node.metadata.name),
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
const initialStatusCount = {
  completed: 0,
  failed: 0,
  exception: 0,
  running: 0,
  pending: 0,
  unscheduled: 0,
};
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

@withStyles(theme => ({
  statusButton: {
    display: 'flex',
    flexGrow: 1,
    flexBasis: 0,
    padding: `${theme.spacing.unit}px ${theme.spacing.unit}px`,
    justifyContent: 'space-around',
    cursor: 'pointer',
    margin: theme.spacing.unit,
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
  static defaultProps = {
    taskGroup: null,
    filter: null,
  };

  static propTypes = {
    /** The selected task state. This will change the card icon. */
    filter: taskState,
    /** Callback fired when the a state card is clicked */
    onStatusClick: func.isRequired,
    /* eslint-disable react/no-unused-prop-types */
    /** The task group ID being inspected. */
    taskGroupId: string.isRequired,
    /** A Task GraphQL PageConnection instance. */
    taskGroup: shape({
      pageInfo,
      edges: arrayOf(task),
    }),
    /* eslint-enable react/no-unused-prop-types */
  };

  state = {
    statusCount: initialStatusCount,
  };

  static getDerivedStateFromProps(props) {
    const { taskGroupId, taskGroup } = props;
    // Make sure data is not from another task group which
    // can happen when a user searches for a different task group
    const isFromSameTaskGroupId =
      taskGroup &&
      (taskGroup.edges[0]
        ? taskGroup.edges[0].node.taskGroupId === taskGroupId
        : true);

    // We're done counting
    if (isFromSameTaskGroupId && !taskGroup.pageInfo.hasNextPage) {
      const newStatusCount = taskGroup.edges
        ? getStatusCount(taskGroup.edges)
        : {};

      return { statusCount: newStatusCount };
    }

    return {
      statusCount: initialStatusCount,
    };
  }

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
    const { classes, onStatusClick } = this.props;
    const { statusCount } = this.state;
    const showDots = Object.values(statusCount).reduce((a, b) => a + b) === 0;

    return (
      <Grid container spacing={16}>
        {Object.keys(TASK_STATE).map(status => {
          const Icon = this.getStatusIcon(status);

          return (
            <ButtonBase
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
                  className={classes.statusButtonTypography}
                  variant="h4">
                  {showDots ? '...' : statusCount[lowerCase(status)]}
                </Typography>
                <Typography
                  className={classNames(
                    classes.statusTitle,
                    classes.statusButtonTypography
                  )}
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
