import React, { Component, Fragment } from 'react';
import { Queue } from '@taskcluster/client-web';
import classNames from 'classnames';
import Typography from '@material-ui/core/Typography';
import { withStyles } from '@material-ui/core/styles';
import List from '@material-ui/core/List';
import ListItem from '@material-ui/core/ListItem';
import ListItemText from '@material-ui/core/ListItemText';
import Divider from '@material-ui/core/Divider';
import FormControlLabel from '@material-ui/core/FormControlLabel';
import Switch from '@material-ui/core/Switch';
import ConsoleIcon from 'mdi-react/ConsoleIcon';
import LinkIcon from 'mdi-react/LinkIcon';
import OpenInNewIcon from 'mdi-react/OpenInNewIcon';
import Spinner from '../../../components/Spinner';
import Dashboard from '../../../components/Dashboard';
import Markdown from '../../../components/Markdown';
import StatusLabel from '../../../components/StatusLabel';
import ErrorPanel from '../../../components/ErrorPanel';
import { withAuth } from '../../../utils/Auth';
import { withTaskclusterClient } from '../../../utils/TaskclusterClient';
import notify from '../../../utils/notify';
import Link from '../../../utils/Link';
import fetchAllPages from '../../../utils/fetchAllPages';
import { getLatestArtifactUrl } from '../../../utils/getArtifactUrl';
import {
  INTERACTIVE_TASK_STATUS,
  TASK_STATE,
  INTERACTIVE_CONNECT_TASK_POLL_INTERVAL,
} from '../../../utils/constants';

const NOTIFY_KEY = 'interactive-notify';
// The queue's REST API reports task states in lowercase; the UI standardizes
// on the uppercase TASK_STATE values.
const toUiState = state => {
  return state?.toUpperCase();
};

const getInteractiveStatus = ({
  shellArtifact = null,
  taskStatusState = null,
}) => {
  if (!shellArtifact) {
    return INTERACTIVE_TASK_STATUS.WAITING;
  }

  if (
    [TASK_STATE.COMPLETED, TASK_STATE.FAILED, TASK_STATE.EXCEPTION].includes(
      taskStatusState
    )
  ) {
    return INTERACTIVE_TASK_STATUS.RESOLVED;
  }

  return INTERACTIVE_TASK_STATUS.READY;
};

// List every artifact of the latest run. A task that has not been claimed
// yet has no runs, which the queue reports as a 404; treat that the same as
// having no artifacts so the page keeps waiting for the session.
const fetchLatestArtifacts = async (queue, taskId) => {
  try {
    return await fetchAllPages(
      options => {
        return queue.listLatestArtifacts(taskId, options);
      },
      response => {
        return response.artifacts;
      }
    );
  } catch (err) {
    if (err.statusCode === 404) {
      return [];
    }

    throw err;
  }
};

@withAuth
@withTaskclusterClient
@withStyles(theme => ({
  listItemButton: {
    ...theme.mixins.listItemButton,
  },
  divider: {
    margin: `${theme.spacing(2)}px 0`,
  },
  warningPanel: {
    marginTop: theme.spacing(2),
    marginBottom: theme.spacing(2),
  },
  viewTaskDetails: {
    marginTop: theme.spacing(2),
  },
  listItemLeftIcon: {
    marginRight: theme.spacing(1),
  },
}))
export default class InteractiveConnect extends Component {
  state = {
    task: null,
    taskState: null,
    shellArtifact: null,
    loading: true,
    error: null,
    notifyOnReady:
      'Notification' in window && localStorage.getItem(NOTIFY_KEY) === 'true',
    sessionReady: false,
  };

  // Guards against out-of-order responses when the task ID changes while a
  // poll is in flight, and against updating state after unmounting.
  requestId = 0;

  componentDidMount() {
    this.load();
    this.startPolling();
  }

  componentDidUpdate(prevProps, prevState) {
    const {
      match: {
        params: { taskId },
      },
    } = this.props;
    const { sessionReady, notifyOnReady } = this.state;

    if (prevProps.match.params.taskId !== taskId) {
      this.requestId += 1;
      this.setState({
        task: null,
        taskState: null,
        shellArtifact: null,
        loading: true,
        error: null,
        sessionReady: false,
      });
      this.load();
      this.startPolling();

      return;
    }

    if (
      // Do not notify initially even if a session is ready
      prevState.task &&
      !prevState.sessionReady &&
      sessionReady &&
      notifyOnReady
    ) {
      notify({
        body: 'Interactive task is ready for connecting',
      });
    }
  }

  componentWillUnmount() {
    this.requestId += 1;
    this.stopPolling();
  }

  startPolling() {
    this.stopPolling();
    this.pollInterval = setInterval(
      this.load,
      INTERACTIVE_CONNECT_TASK_POLL_INTERVAL
    );
  }

  stopPolling() {
    if (this.pollInterval) {
      clearInterval(this.pollInterval);
      this.pollInterval = null;
    }
  }

  load = async () => {
    const {
      createTaskclusterClient,
      match: {
        params: { taskId },
      },
    } = this.props;
    const id = ++this.requestId;
    const queue = createTaskclusterClient({ Class: Queue });

    try {
      const [task, { status }, artifacts] = await Promise.all([
        queue.task(taskId),
        queue.status(taskId),
        fetchLatestArtifacts(queue, taskId),
      ]);

      if (id !== this.requestId) {
        return;
      }

      const taskState = toUiState(status.state);
      const shellArtifact =
        artifacts.find(artifact => {
          return artifact.name.endsWith('shell.html');
        }) ?? null;

      this.setState(prevState => {
        return {
          task,
          taskState,
          shellArtifact,
          loading: false,
          error: null,
          sessionReady:
            prevState.sessionReady ||
            getInteractiveStatus({
              shellArtifact,
              taskStatusState: taskState,
            }) === INTERACTIVE_TASK_STATUS.READY,
        };
      });
    } catch (error) {
      if (id !== this.requestId) {
        return;
      }

      this.setState({ loading: false, error });
    }
  };

  handleShellOpen = () => {
    const {
      user,
      match: {
        params: { taskId },
      },
    } = this.props;
    const { name } = this.state.shellArtifact;
    const url = getLatestArtifactUrl({ user, taskId, name });

    window.open(url, '_blank');
  };

  handleNotificationChange = async ({ target: { checked } }) => {
    if (Notification.permission === 'granted') {
      localStorage.setItem(NOTIFY_KEY, checked);

      return this.setState({ notifyOnReady: checked });
    }

    // The user is requesting to be notified, but has not yet granted permission
    const permission = await Notification.requestPermission();
    const notifyOnReady = permission === 'granted';

    localStorage.setItem(NOTIFY_KEY, notifyOnReady);
    this.setState({ notifyOnReady });
  };

  renderTask = () => {
    const {
      classes,
      match: {
        params: { taskId },
      },
      user,
    } = this.props;
    const { task, taskState, shellArtifact, notifyOnReady } = this.state;
    const interactiveStatus = getInteractiveStatus({
      shellArtifact,
      taskStatusState: taskState,
    });
    const isSessionReady = interactiveStatus === INTERACTIVE_TASK_STATUS.READY;
    const isSessionResolved =
      interactiveStatus === INTERACTIVE_TASK_STATUS.RESOLVED;

    return (
      <Fragment>
        {isSessionReady && (
          <ErrorPanel
            className={classes.warningPanel}
            warning
            error="This is not a development environment. Interactive
              tasks can help debug issues, but note that these workers may be spot
              nodes that can be terminated at any time."
          />
        )}
        {isSessionResolved && (
          <ErrorPanel
            warning
            error="You can not attach to an interactive task after it has stopped
          running."
            className={classes.warningPanel}
          />
        )}
        <List>
          <ListItem>
            <ListItemText primary="Name" secondary={task.metadata.name} />
          </ListItem>
          <ListItem>
            <ListItemText
              primary="Description"
              secondary={<Markdown>{task.metadata.description}</Markdown>}
            />
          </ListItem>
          <ListItem>
            <ListItemText
              primary="State"
              secondary={<StatusLabel state={taskState} />}
            />
          </ListItem>
          <ListItem>
            <ListItemText
              primary="Interactive Status"
              secondary={<StatusLabel state={interactiveStatus} />}
            />
          </ListItem>
          <ListItem>
            <FormControlLabel
              control={
                <Switch
                  disabled={
                    !('Notification' in window) ||
                    Notification.permission === 'denied' ||
                    isSessionReady
                  }
                  checked={notifyOnReady}
                  onChange={this.handleNotificationChange}
                  color="secondary"
                />
              }
              label="Notify Me on Ready"
            />
          </ListItem>
          <Link to={`/tasks/${taskId}`}>
            <ListItem
              button
              className={classNames(
                classes.listItemButton,
                classes.viewTaskDetails
              )}>
              <ListItemText primary="View task details" />
              <LinkIcon />
            </ListItem>
          </Link>
        </List>
        {isSessionReady && (
          <Fragment>
            <Divider className={classes.divider} />
            <Typography variant="h5">Select a Session</Typography>
            <Typography variant="body2">
              You have approximately <strong>5 minutes</strong> to connect,
              after that the task will shutdown when all connections are closed.
            </Typography>
            <List>
              <ListItem
                disabled={!user}
                button
                onClick={this.handleShellOpen}
                className={classes.listItemButton}>
                <ConsoleIcon className={classes.listItemLeftIcon} />
                <ListItemText primary="Shell" />
                <OpenInNewIcon />
              </ListItem>
            </List>
          </Fragment>
        )}
      </Fragment>
    );
  };

  render() {
    const { task, taskState, loading, error } = this.state;

    return (
      <Dashboard title="Interactive Connect">
        {!error && loading && <Spinner loading />}
        <ErrorPanel fixed error={error} />
        {!loading && task && taskState && this.renderTask()}
      </Dashboard>
    );
  }
}
