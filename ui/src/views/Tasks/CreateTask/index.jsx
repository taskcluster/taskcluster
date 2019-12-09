import { hot } from 'react-hot-loader';
import React, { Component, Fragment } from 'react';
import { Redirect } from 'react-router-dom';
import { parse, stringify } from 'qs';
import { withApollo } from 'react-apollo';
import storage from 'localforage';
import merge from 'deepmerge';
import { safeLoad, safeDump } from 'js-yaml';
import { bool } from 'prop-types';
import {
  toDate,
  parseISO,
  differenceInMilliseconds,
  addMilliseconds,
  addHours,
} from 'date-fns';
import CodeEditor from '@mozilla-frontend-infra/components/CodeEditor';
import { withStyles } from '@material-ui/core/styles';
import Switch from '@material-ui/core/Switch';
import Typography from '@material-ui/core/Typography';
import FormControlLabel from '@material-ui/core/FormControlLabel';
import List from '@material-ui/core/List';
import ListItem from '@material-ui/core/ListItem';
import ListItemText from '@material-ui/core/ListItemText';
import ListSubheader from '@material-ui/core/ListSubheader';
import LinkIcon from 'mdi-react/LinkIcon';
import ContentSaveIcon from 'mdi-react/ContentSaveIcon';
import RotateLeftIcon from 'mdi-react/RotateLeftIcon';
import ClockOutlineIcon from 'mdi-react/ClockOutlineIcon';
import SpeedDial from '../../../components/SpeedDial';
import SpeedDialAction from '../../../components/SpeedDialAction';
import HelpView from '../../../components/HelpView';
import Dashboard from '../../../components/Dashboard';
import ErrorPanel from '../../../components/ErrorPanel';
import { nice } from '../../../utils/slugid';
import formatTaskMutation from '../../../utils/formatTaskMutation';
import {
  TASKS_CREATE_STORAGE_KEY,
  ISO_8601_REGEX,
} from '../../../utils/constants';
import urls from '../../../utils/urls';
import createTaskQuery from '../createTask.graphql';
import Button from '../../../components/Button';
import db from '../../../utils/db';

const defaultTask = {
  provisionerId: 'proj-getting-started',
  workerType: 'tutorial',
  schedulerId: 'taskcluster-ui',
  created: new Date().toISOString(),
  deadline: toDate(addHours(new Date(), 3)).toISOString(),
  payload: {
    image: 'ubuntu:latest',
    command: [
      '/bin/bash',
      '-c',
      'for ((i=1;i<=600;i++)); do echo $i; sleep 1; done',
    ],
    // 30s margin to avoid task timeout winning race against task command.
    maxRunTime: 600 + 30,
  },
  metadata: {
    name: 'example-task',
    description: 'An **example** task',
    owner: 'name@example.com',
    source: `${window.location.origin}/tasks/create`,
  },
};

@hot(module)
@withApollo
@withStyles(theme => ({
  createIcon: {
    ...theme.mixins.successIcon,
  },
  createIconSpan: {
    ...theme.mixins.fab,
    ...theme.mixins.actionButton,
    right: theme.spacing(11),
  },
  listItemButton: {
    ...theme.mixins.listItemButton,
  },
}))
export default class CreateTask extends Component {
  static defaultProps = {
    interactive: false,
  };

  static propTypes = {
    /** If true, the task will initially be set as an interactive task. */
    interactive: bool,
  };

  state = {
    task: null,
    error: null,
    invalid: null,
    createdTaskError: null,
    loading: false,
    recentTaskDefinitions: [],
  };

  async getRecentTaskDefinitions() {
    try {
      return await db.taskDefinitions
        .orderBy('created')
        .limit(5)
        .reverse()
        .toArray();
    } catch (_) {
      return [];
    }
  }

  async componentDidMount() {
    const task = await this.getTask();
    const recentTaskDefinitions = await this.getRecentTaskDefinitions();

    try {
      this.setState({
        recentTaskDefinitions,
        task: this.parameterizeTask(task),
        error: null,
      });
    } catch (err) {
      this.setState({
        error: err,
        task: null,
      });
    }
  }

  async getTask() {
    const { location } = this.props;
    const { task } = this.state;

    if (task) {
      return task;
    }

    if (location.state && location.state.task) {
      return location.state.task;
    }

    try {
      const task = await storage.getItem(TASKS_CREATE_STORAGE_KEY);

      return task || defaultTask;
    } catch (err) {
      return defaultTask;
    }
  }

  makeInteractive(payload) {
    const task = merge(payload, {
      payload: {
        features: {
          interactive: true,
        },
      },
    });

    if (task.payload.caches) {
      delete task.payload.caches;
    }

    // Minimum of an hour
    task.payload.maxRunTime = Math.max(3600, task.payload.maxRunTime || 0);

    // Avoid side-effects
    if (task.routes) {
      delete task.routes;
    }

    return task;
  }

  handleCreateTask = async () => {
    const { interactive } = parse(this.props.location.search.slice(1));
    const { task } = this.state;

    if (task) {
      const taskId = nice();
      let payload = safeLoad(task);

      db.taskDefinitions.put(payload);

      if (interactive) {
        payload = this.makeInteractive(payload);
      }

      this.setState({ loading: true });

      try {
        await this.props.client.mutate({
          mutation: createTaskQuery,
          variables: {
            taskId,
            task: formatTaskMutation(payload),
          },
        });

        this.setState({ loading: false, createdTaskId: taskId });
        storage.setItem(TASKS_CREATE_STORAGE_KEY, payload);
      } catch (err) {
        this.setState({
          loading: false,
          createdTaskError: err,
          createdTaskId: null,
        });
      }
    }
  };

  handleInteractiveChange = ({ target: { checked } }) => {
    const query = {
      ...parse(this.props.location.search.slice(1)),
      interactive: checked ? '1' : undefined,
    };

    this.props.history.replace(
      `/tasks/create${stringify(query, { addQueryPrefix: true })}`
    );
  };

  handleResetEditor = () =>
    this.setState({
      createdTaskError: null,
      task: this.parameterizeTask(defaultTask),
      invalid: false,
    });

  handleRecentTaskDefinitionClick = task => {
    this.setState({
      task: this.parameterizeTask(task),
    });
  };

  handleTaskChange = value => {
    try {
      safeLoad(value);
      this.setState({ invalid: false, task: value });
    } catch (err) {
      this.setState({ invalid: true, task: value });
    }
  };

  handleUpdateTimestamps = () =>
    this.setState({
      createdTaskError: null,
      task: this.parameterizeTask(safeLoad(this.state.task)),
    });

  parameterizeTask(task) {
    const offset = differenceInMilliseconds(new Date(), parseISO(task.created));
    // Increment all timestamps in the task by offset
    const iter = obj => {
      if (!obj) {
        return obj;
      }

      switch (typeof obj) {
        case 'object':
          return Array.isArray(obj)
            ? obj.map(iter)
            : Object.entries(obj).reduce(
                (o, [key, value]) => ({ ...o, [key]: iter(value) }),
                {}
              );

        case 'string':
          return ISO_8601_REGEX.test(obj)
            ? toDate(addMilliseconds(parseISO(obj), offset)).toISOString()
            : obj;

        default:
          return obj;
      }
    };

    return `${safeDump(iter(task), { noCompatMode: true, noRefs: true })}`;
  }

  render() {
    const { location, description, classes } = this.props;
    const { interactive } = parse(location.search.slice(1));
    const {
      task,
      error,
      createdTaskError,
      invalid,
      createdTaskId,
      loading,
      recentTaskDefinitions,
    } = this.state;

    if (createdTaskId && interactive) {
      return <Redirect to={`/tasks/${createdTaskId}/connect`} push />;
    }

    // If loaded, redirect to task inspector.
    // We'll show errors later if there are errors.
    if (createdTaskId) {
      return <Redirect to={`/tasks/${createdTaskId}`} push />;
    }

    return (
      <Dashboard
        title="Create Task"
        helpView={
          <HelpView description={description}>
            <Typography variant="body2">
              For details on what you can write, refer to the{' '}
              <a
                href={urls.docs('/')}
                target="_blank"
                rel="noopener noreferrer">
                documentation
              </a>
              . When you submit a task here, you will be taken to{' '}
              {interactive
                ? 'connect to the interactive task'
                : 'inspect the created task'}
              . Your task will be saved so you can come back and experiment with
              variations.
            </Typography>
          </HelpView>
        }>
        <Fragment>
          {error ? (
            <ErrorPanel fixed error={error} />
          ) : (
            <Fragment>
              <ErrorPanel fixed error={createdTaskError} />
              <FormControlLabel
                control={
                  <Switch
                    checked={interactive}
                    onChange={this.handleInteractiveChange}
                    color="secondary"
                  />
                }
                label="Interactive"
              />
              <CodeEditor
                mode="yaml"
                lint
                value={task || ''}
                onChange={this.handleTaskChange}
              />
              <br />
              {Boolean(recentTaskDefinitions.length) && (
                <List
                  dense
                  subheader={
                    <ListSubheader component="div">
                      Recent Task Definitions
                    </ListSubheader>
                  }>
                  {this.state.recentTaskDefinitions.map(task => (
                    <ListItem
                      className={classes.listItemButton}
                      button
                      onClick={() => {
                        this.handleRecentTaskDefinitionClick(task);
                      }}
                      key={task.metadata.name}>
                      <ListItemText
                        disableTypography
                        primary={
                          <Typography variant="body2">
                            {task.metadata.name}
                          </Typography>
                        }
                      />
                      <LinkIcon />
                    </ListItem>
                  ))}
                </List>
              )}
              <Button
                spanProps={{ className: classes.createIconSpan }}
                tooltipProps={{ title: 'Create Task' }}
                requiresAuth
                disabled={!task || invalid || loading}
                variant="round"
                className={classes.createIcon}
                onClick={this.handleCreateTask}>
                <ContentSaveIcon />
              </Button>
              <SpeedDial>
                <SpeedDialAction
                  tooltipOpen
                  icon={<RotateLeftIcon />}
                  onClick={this.handleResetEditor}
                  tooltipTitle="Reset Editor"
                />
                <SpeedDialAction
                  tooltipOpen
                  icon={<ClockOutlineIcon />}
                  onClick={this.handleUpdateTimestamps}
                  tooltipTitle="Update Timestamps"
                  FabProps={{
                    disabled: !task || invalid,
                  }}
                />
              </SpeedDial>
            </Fragment>
          )}
        </Fragment>
      </Dashboard>
    );
  }
}
