import React, { Component } from 'react';
import { shape, arrayOf, string } from 'prop-types';
import { Paper, Grid, withStyles } from '@material-ui/core';
import { taskState, pageInfo, task } from '../../utils/prop-types';
import { THEME } from '../../utils/constants';
import Link from '../../utils/Link';
import {
  formatTime,
  sampleTasks,
  quantile,
  filterTasksWithDuration,
} from '../../utils/task';

@withStyles(theme => ({
  container: {
    marginBottom: theme.spacing(2),
    padding: theme.spacing(1),
  },
  legend: {
    left: theme.spacing(1),
    top: theme.spacing(1),
    padding: theme.spacing(1),
    fontSize: 14,
    '& strong': {
      float: 'right',
      marginLeft: theme.spacing(1),
    },
  },
  chartContainer: {
    position: 'relative',
  },
  popover: {
    position: 'absolute',
    bottom: theme.spacing(0),
    left: theme.spacing(0),
    padding: theme.spacing(1),
    marginLeft: theme.spacing(1),
    fontSize: 12,
    '& strong': {
      marginRight: theme.spacing(1),
    },
    '& a': {
      textDecoration: 'underline',
    },
  },
  sampleSwitch: {
    position: 'absolute',
    bottom: theme.spacing(0.5),
    right: theme.spacing(2),
    cursor: 'pointer',
    color: theme.palette.info.main,
  },
  chart: {
    color: THEME.PRIMARY_TEXT_DARK,
    padding: theme.spacing(1),
    marginTop: theme.spacing(0),
    height: 150,
  },
  bar: {
    '&:hover': {
      cursor: 'pointer',
    },
    '&:hover rect': {
      opacity: 0.7,
    },
  },
  activeBar: {
    stroke: theme.palette.primary.dark,
    strokeWidth: 0.2,
  },
  barNormal: {
    fill: theme.palette.success.main,
    '&[class*="barAbove"]': {
      fill: theme.palette.warning.main,
    },
    '&[class*="barHigh"]': {
      fill: theme.palette.warning.dark,
    },
  },
  barError: {
    fill: theme.palette.error.light,
    '&[class*="barAbove"]': {
      fill: theme.palette.error.main,
    },
    '&[class*="barHigh"]': {
      fill: theme.palette.error.dark,
    },
  },
  aboveThreshold: {
    color: theme.palette.warning.main,
  },
}))
export default class TaskGroupStats extends Component {
  static propTypes = {
    filter: taskState,
    searchTerm: string,

    /** A Task GraphQL PageConnection instance. */
    taskGroup: shape({
      pageInfo,
      edges: arrayOf(task),
    }),
  };

  static defaultProps = {
    filter: null,
    taskGroup: null,
  };

  state = {
    activeTask: null,
    selectedTask: null,
    graphAll: false,
  };

  setActiveTask(activeTask) {
    this.setState({
      activeTask,
    });
  }

  setSelectedTask(task) {
    this.setState(state => ({
      selectedTask: state.selectedTask?.taskId === task?.taskId ? null : task,
    }));
  }

  toggleGraphAll() {
    this.setState(state => ({ graphAll: !state.graphAll }));
  }

  render() {
    const { filter, taskGroup, searchTerm, classes } = this.props;
    const { activeTask, selectedTask, graphAll } = this.state;
    const maxTasksInGraph = 200;
    const tasks = filterTasksWithDuration(taskGroup?.edges, filter, searchTerm);
    const starts = Math.min(...tasks.map(t => t.minStart));
    const resolves = Math.max(...tasks.map(t => t.maxResolve));
    const durations = tasks.map(t => t.duration);
    const minDuration = durations?.[0] || 0;
    const maxDuration = durations?.[durations.length - 1] || 0;
    const padding = 2;
    const height = 30;
    const barWidth = 2;
    const maxInSample = Math.min(maxTasksInGraph, tasks.length);
    const sampledTasks = sampleTasks(
      tasks,
      filter,
      searchTerm,
      graphAll ? +Infinity : maxTasksInGraph
    );
    const width = (sampledTasks.length + 1) * barWidth;
    const relativeHeight = d => Math.max(1, (height * d) / maxDuration);
    const median = quantile(durations, 0.5);
    const q75 = quantile(durations, 0.75);
    const q99 = quantile(durations, 0.99);
    const total = durations.reduce((acc, t) => acc + t, 0);
    const getClass = (duration, state) => {
      const cls = [];

      if (['failed', 'exception'].includes(String(state).toLowerCase())) {
        cls.push(classes.barError);
      } else {
        cls.push(classes.barNormal);
      }

      if (duration >= q99) {
        cls.push('barHigh');
      } else if (duration >= q75) {
        cls.push('barAbove');
      }

      return cls.join(' ');
    };

    return (
      <Paper className={classes.container}>
        <Grid container>
          <Grid item xs={12} sm={3} className={classes.legend}>
            {resolves && starts && (
              <div>
                <abbr title="Time from first task to start till last task to finish">
                  First to last
                </abbr>
                : <strong>{formatTime(resolves - starts)}</strong>
              </div>
            )}
            <div>
              Shortest: <strong>{formatTime(minDuration)}</strong>
            </div>
            <div>
              Median: <strong>{formatTime(median)}</strong>
            </div>
            <div className={classes.aboveThreshold}>
              75th percentile: <strong>{formatTime(q75)}</strong>
            </div>
            <div className={classes.aboveThreshold}>
              99th percentile: <strong>{formatTime(q99)}</strong>
            </div>
            <div className={classes.aboveThreshold}>
              Longest: <strong>{formatTime(maxDuration)}</strong>
            </div>
            <div>
              Durations sum: <strong>{formatTime(total)}</strong>
            </div>
          </Grid>
          <Grid item xs={12} sm={9} className={classes.chartContainer}>
            {activeTask && (
              <div className={classes.popover}>
                <strong>{formatTime(activeTask.duration)}</strong>
                {activeTask.name}
              </div>
            )}
            {!activeTask && selectedTask && (
              <div className={classes.popover}>
                <Link
                  title={selectedTask.name}
                  to={`/tasks/${selectedTask.taskId}`}>
                  <strong>{formatTime(selectedTask.duration)}</strong>
                  {selectedTask.name}
                </Link>
              </div>
            )}
            {tasks.length > maxTasksInGraph && (
              <div
                className={classes.sampleSwitch}
                role="button"
                tabIndex={0}
                onClick={() => this.toggleGraphAll()}>
                {graphAll
                  ? `Show sample (${maxInSample})`
                  : `Show all (${tasks.length})`}
              </div>
            )}
            <svg
              className={classes.chart}
              xmlns="http://www.w3.org/2000/svg"
              preserveAspectRatio="none"
              width="100%"
              viewBox={`0 0 ${width + padding} ${height + padding * 2}`}>
              <desc>TaskGroup run times</desc>
              {sampledTasks.map((task, index) => (
                <g
                  key={task.taskId}
                  className={`${classes.bar} ${
                    selectedTask?.taskId === task.taskId
                      ? classes.activeBar
                      : ''
                  }`}
                  transform={`translate(${index * barWidth + padding / 2}, 0)`}
                  onMouseEnter={() => this.setActiveTask(task)}
                  onMouseLeave={() => this.setActiveTask(null)}
                  onClick={() => this.setSelectedTask(task)}>
                  <rect
                    width={barWidth - 0.1}
                    height={height + padding / 2}
                    y={0}
                    x="0"
                    fill="#ffffff11"
                  />
                  <rect
                    width={barWidth - 0.1}
                    height={relativeHeight(task.duration)}
                    y={height + padding / 2 - relativeHeight(task.duration)}
                    x={0}
                    className={getClass(task.duration, task.state)}
                  />
                </g>
              ))}
            </svg>
          </Grid>
        </Grid>
      </Paper>
    );
  }
}
