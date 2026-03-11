import React, { Component } from 'react';
import { bool, func, shape, number, string } from 'prop-types';
import { sum } from 'ramda';
import { titleCase } from 'title-case';
import classNames from 'classnames';
import { withStyles } from '@material-ui/core/styles';
import amber from '@material-ui/core/colors/amber';
import blue from '@material-ui/core/colors/blue';
import grey from '@material-ui/core/colors/grey';
import green from '@material-ui/core/colors/green';
import purple from '@material-ui/core/colors/purple';
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
import Spinner from '../Spinner';
import { taskState } from '../../utils/prop-types';
import { TASK_STATE, THEME } from '../../utils/constants';
import Helmet from '../Helmet';

@withStyles(theme => ({
  statusButton: {
    display: 'flex',
    flexGrow: 1,
    flexBasis: 0,
    padding: `${theme.spacing(1)}px ${theme.spacing(1)}px`,
    justifyContent: 'space-around',
    cursor: 'pointer',
    margin: theme.spacing(1),
    '& > div': {
      display: 'flex',
      flexDirection: 'column',
      width: '100%',
    },
    borderRadius: theme.spacing(0.25),
  },
  statusButtonTypography: {
    color: THEME.PRIMARY_TEXT_DARK,
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
    backgroundColor: purple[400],
    '&:hover': {
      backgroundColor: purple[600],
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
  noTasksButton: {
    opacity: 0.3,
  },
  spinner: {
    left: '47%',
    bottom: '42%',
    position: 'absolute',
  },
}))
export default class TaskGroupProgress extends Component {
  static propTypes = {
    /** The selected task state. This will change the card icon. */
    filter: taskState,
    /** Callback fired when the a state card is clicked */
    onStatusClick: func.isRequired,
    /**
     * If false, a spinner indicator will be displayed in the card.
     * This is useful to have when loading is done in steps
     * (e.g., 1000 tasks at a time)
     * */
    taskGroupLoaded: bool,
    /** The task group ID being inspected. */
    taskGroupId: string.isRequired,
    /** Status counts for each task state. */
    statusCount: shape({
      completed: number.isRequired,
      failed: number.isRequired,
      exception: number.isRequired,
      running: number.isRequired,
      pending: number.isRequired,
      unscheduled: number.isRequired,
    }).isRequired,
  };

  static defaultProps = {
    filter: null,
    taskGroupLoaded: true,
  };

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

  getTaskGroupState = () => {
    const {
      completed,
      exception,
      failed,
      pending,
      running,
      unscheduled,
    } = this.props.statusCount;
    const allTasks = sum([completed, exception, pending, running, unscheduled]);
    const unfinishedTasks = sum([pending, running, unscheduled]);

    if (allTasks === 0) {
      return;
    }

    if (failed > 0 || exception > 0) {
      return TASK_STATE.FAILED;
    }

    if (unfinishedTasks > 0) {
      return TASK_STATE.RUNNING;
    }

    return TASK_STATE.COMPLETED;
  };

  render() {
    const { classes, onStatusClick, taskGroupLoaded, statusCount } = this.props;
    const showDots = Object.values(statusCount).reduce((a, b) => a + b) === 0;
    const taskGroupState = this.getTaskGroupState();

    return (
      <Grid container spacing={2}>
        <Helmet state={taskGroupState} />
        {Object.keys(TASK_STATE).map(status => {
          const Icon = this.getStatusIcon(status);
          const count = statusCount[status.toLowerCase()];

          return (
            <ButtonBase
              focusRipple
              key={status}
              name={status}
              variant="contained"
              onClick={onStatusClick}
              className={classNames(
                classes[`${status.toLowerCase()}Button`],
                classes.statusButton,
                {
                  [classes.noTasksButton]: count === 0,
                }
              )}>
              <div>
                <Icon color="white" className={classes.statusIcon} size={32} />
                {!taskGroupLoaded && !showDots && (
                  <Spinner size={12} className={classes.spinner} />
                )}
              </div>
              <div>
                <Typography
                  align="right"
                  className={classes.statusButtonTypography}
                  variant="h4">
                  {showDots ? '...' : count}
                </Typography>
                <Typography
                  className={classNames(
                    classes.statusTitle,
                    classes.statusButtonTypography
                  )}
                  variant="caption">
                  {titleCase(status)}
                </Typography>
              </div>
            </ButtonBase>
          );
        })}
      </Grid>
    );
  }
}
