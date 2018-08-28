import { hot } from 'react-hot-loader';
import { Component, Fragment } from 'react';
import { Redirect } from 'react-router-dom';
import { withApollo } from 'react-apollo';
import storage from 'localforage';
import { safeLoad, safeDump } from 'js-yaml';
import { bool } from 'prop-types';
import {
  toDate,
  differenceInMilliseconds,
  addMilliseconds,
  addHours,
} from 'date-fns';
import ErrorPanel from '@mozilla-frontend-infra/components/ErrorPanel';
import CodeEditor from '@mozilla-frontend-infra/components/CodeEditor';
import { withStyles } from '@material-ui/core/styles';
import Switch from '@material-ui/core/Switch';
import FormControlLabel from '@material-ui/core/FormControlLabel';
import PlusIcon from 'mdi-react/PlusIcon';
import RotateLeftIcon from 'mdi-react/RotateLeftIcon';
import ClockOutlineIcon from 'mdi-react/ClockOutlineIcon';
import SpeedDial from '../../../components/SpeedDial';
import SpeedDialAction from '../../../components/SpeedDialAction';
import Dashboard from '../../../components/Dashboard';
import { nice } from '../../../utils/slugid';
import {
  TASKS_CREATE_STORAGE_KEY,
  ISO_8601_REGEX,
} from '../../../utils/constants';
import createTaskQuery from './createTask.graphql';

const defaultTask = {
  provisionerId: 'aws-provisioner-v1',
  workerType: 'tutorial',
  created: new Date().toISOString(),
  deadline: toDate(addHours(new Date(), 3)).toISOString(),
  payload: {
    image: 'ubuntu:13.10',
    command: [
      '/bin/bash',
      '-c',
      'for ((i=1;i<=600;i++)); do echo $i; sleep 1; done',
    ],
    // 30s margin to avoid task timeout winning race against task command.
    maxRunTime: 600 + 30,
  },
  metadata: {
    name: 'Example Task',
    description: 'Markdown description of **what** this task does',
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
}))
export default class CreateTask extends Component {
  state = {
    task: null,
    error: null,
    invalid: null,
    createdTaskError: null,
    interactive: false,
    loading: false,
  };

  static propTypes = {
    /** If true, the task will initially be set as an interactive task. */
    interactive: bool,
  };

  static defaultProps = {
    interactive: false,
  };

  async componentDidMount() {
    const task = await this.getTask();

    try {
      this.setState({
        interactive: this.props.interactive,
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

  parameterizeTask(task) {
    const offset = differenceInMilliseconds(new Date(), task.created);
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
            ? toDate(addMilliseconds(obj, offset)).toISOString()
            : obj;

        default:
          return obj;
      }
    };

    return `${safeDump(iter(task), { noCompatMode: true, noRefs: true })}`;
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

  handleTaskChange = value => {
    try {
      safeLoad(value);
      this.setState({ invalid: false, task: value });
    } catch (err) {
      this.setState({ invalid: true, task: value });
    }
  };

  handleInteractiveChange = ({ target: { checked } }) => {
    this.setState({ interactive: checked });

    this.props.history.replace(
      checked ? '/tasks/create/interactive' : '/tasks/create'
    );
  };

  handleCreateTask = async () => {
    const { task } = this.state;

    if (task) {
      const taskId = nice();
      const payload = safeLoad(task);

      this.setState({ loading: true });

      try {
        await this.props.client.mutate({
          mutation: createTaskQuery,
          variables: {
            taskId,
            task: payload,
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

  handleUpdateTimestamps = () =>
    this.setState({
      createdTaskError: null,
      task: this.parameterizeTask(safeLoad(this.state.task)),
    });

  handleResetEditor = () =>
    this.setState({
      createdTaskError: null,
      task: this.parameterizeTask(defaultTask),
      invalid: false,
    });

  render() {
    const { classes } = this.props;
    const {
      task,
      error,
      createdTaskError,
      invalid,
      interactive,
      createdTaskId,
      loading,
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
      <Dashboard title="Create Task">
        <Fragment>
          {error ? (
            <ErrorPanel error={error} />
          ) : (
            <Fragment>
              {createdTaskError && <ErrorPanel error={createdTaskError} />}
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
              <SpeedDial>
                <SpeedDialAction
                  requiresAuth
                  icon={<PlusIcon />}
                  onClick={this.handleCreateTask}
                  tooltipTitle="Create Task"
                  classes={{ button: classes.createIcon }}
                  ButtonProps={{
                    disabled: !task || invalid || loading,
                  }}
                />
                <SpeedDialAction
                  icon={<RotateLeftIcon />}
                  onClick={this.handleResetEditor}
                  tooltipTitle="Reset Editor"
                  ButtonProps={{
                    color: 'secondary',
                  }}
                />
                <SpeedDialAction
                  icon={<ClockOutlineIcon />}
                  onClick={this.handleUpdateTimestamps}
                  tooltipTitle="Update Timestamps"
                  ButtonProps={{
                    color: 'secondary',
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
