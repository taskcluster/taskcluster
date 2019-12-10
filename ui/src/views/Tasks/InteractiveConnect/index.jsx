import { hot } from 'react-hot-loader';
import React, { Component, Fragment } from 'react';
import { graphql } from 'react-apollo';
import dotProp from 'dot-prop-immutable';
import classNames from 'classnames';
import Spinner from '@mozilla-frontend-infra/components/Spinner';
import Typography from '@material-ui/core/Typography';
import { withStyles } from '@material-ui/core/styles';
import List from '@material-ui/core/List';
import ListItem from '@material-ui/core/ListItem';
import ListItemText from '@material-ui/core/ListItemText';
import Divider from '@material-ui/core/Divider';
import FormControlLabel from '@material-ui/core/FormControlLabel';
import Switch from '@material-ui/core/Switch';
import ConsoleIcon from 'mdi-react/ConsoleIcon';
import MonitorIcon from 'mdi-react/MonitorIcon';
import LinkIcon from 'mdi-react/LinkIcon';
import OpenInNewIcon from 'mdi-react/OpenInNewIcon';
import Dashboard from '../../../components/Dashboard';
import Markdown from '../../../components/Markdown';
import StatusLabel from '../../../components/StatusLabel';
import ErrorPanel from '../../../components/ErrorPanel';
import { withAuth } from '../../../utils/Auth';
import notify from '../../../utils/notify';
import Link from '../../../utils/Link';
import taskQuery from './task.graphql';
import {
  INITIAL_CURSOR,
  INTERACTIVE_TASK_STATUS,
  TASK_STATE,
  INTERACTIVE_CONNECT_TASK_POLL_INTERVAL,
} from '../../../utils/constants';

let previousCursor;
const NOTIFY_KEY = 'interactive-notify';
const getInteractiveStatus = ({
  shellUrl = null,
  displayUrl = null,
  taskStatusState = null,
}) => {
  if (!shellUrl || !displayUrl) {
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

@hot(module)
@withAuth
@graphql(taskQuery, {
  options: props => ({
    fetchPolicy: 'network-only',
    errorPolicy: 'all',
    pollInterval: INTERACTIVE_CONNECT_TASK_POLL_INTERVAL,
    variables: {
      taskId: props.match.params.taskId,
    },
  }),
})
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
  static getDerivedStateFromProps(
    props,
    { displayUrl, shellUrl, artifactsLoading, previousTaskId, sessionReady }
  ) {
    const {
      data: { task, error },
      match: {
        params: { taskId },
      },
    } = props;

    if (error) {
      return {
        artifactsLoading: false,
      };
    }

    // Reset state when Task ID changes
    if (previousTaskId !== taskId) {
      return {
        displayUrl: null,
        shellUrl: null,
        artifactsLoading: true,
        previousTaskId: taskId,
        sessionReady: false,
      };
    }

    // Get connection URL
    if ((!shellUrl || !displayUrl) && task && task.latestArtifacts) {
      const artifacts = task.latestArtifacts.edges;
      const urls = artifacts.reduce((acc, { node: { name, url } }) => {
        if (name.endsWith('shell.html')) {
          return {
            ...acc,
            shellUrl: url,
          };
        }

        if (name.endsWith('display.html')) {
          return {
            ...acc,
            displayUrl: url,
          };
        }

        return acc;
      }, {});

      return {
        ...urls,
        ...(artifactsLoading && !task.latestArtifacts.pageInfo.hasNextPage
          ? { artifactsLoading: false }
          : null),
        previousTaskId: taskId,
        sessionReady:
          sessionReady ||
          getInteractiveStatus({
            shellUrl: urls.shellUrl,
            displayUrl: urls.displayUrl,
            taskStatusState: task && task.status.state,
          }) === INTERACTIVE_TASK_STATUS.READY,
      };
    }

    return null;
  }

  constructor(props) {
    super(props);

    previousCursor = INITIAL_CURSOR;
  }

  state = {
    displayUrl: null,
    shellUrl: null,
    artifactsLoading: true,
    // eslint-disable-next-line react/no-unused-state
    previousTaskId: this.props.match.params.taskId,
    notifyOnReady:
      'Notification' in window && localStorage.getItem(NOTIFY_KEY) === 'true',
    sessionReady: false,
  };

  componentDidUpdate(prevProps, prevState) {
    const {
      data: { task, fetchMore },
      match: {
        params: { taskId },
      },
    } = this.props;
    const { sessionReady, notifyOnReady } = this.state;

    if (
      // Do not notify initially even if a session is ready
      prevProps.data.task &&
      !prevState.sessionReady &&
      sessionReady &&
      notifyOnReady
    ) {
      notify({
        body: 'Interactive task is ready for connecting',
      });
    }

    // We're done fetching
    if (
      !task ||
      !task.latestArtifacts ||
      !task.latestArtifacts.pageInfo.hasNextPage
    ) {
      previousCursor = INITIAL_CURSOR;

      return;
    }

    if (
      task.latestArtifacts &&
      previousCursor === task.latestArtifacts.pageInfo.cursor
    ) {
      fetchMore({
        variables: {
          taskId,
          artifactsConnection: {
            cursor: task.latestArtifacts.pageInfo.nextCursor,
            previousCursor: task.latestArtifacts.pageInfo.cursor,
          },
        },
        updateQuery(previousResult, { fetchMoreResult, variables }) {
          if (variables.artifactsConnection.previousCursor === previousCursor) {
            const { edges, pageInfo } = fetchMoreResult.task.latestArtifacts;

            previousCursor = variables.artifactsConnection.cursor;

            if (!edges.length) {
              return previousResult;
            }

            const result = dotProp.set(
              previousResult,
              'task.latestArtifacts',
              latestArtifacts =>
                dotProp.set(
                  dotProp.set(
                    latestArtifacts,
                    'edges',
                    previousResult.task.latestArtifacts.edges.concat(edges)
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

  handleDisplayOpen = () => {
    window.open(this.state.displayUrl, '_blank');
  };

  handleShellOpen = () => {
    window.open(this.state.shellUrl, '_blank');
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
      data: { task },
      match: {
        params: { taskId },
      },
      user,
    } = this.props;
    const { shellUrl, displayUrl, notifyOnReady } = this.state;
    const interactiveStatus = getInteractiveStatus({
      shellUrl,
      displayUrl,
      taskStatusState: task && task.status.state,
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
              secondary={<StatusLabel state={task.status.state} />}
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
              <ListItem
                disabled={!user}
                onClick={this.handleDisplayOpen}
                button
                className={classes.listItemButton}>
                <MonitorIcon className={classes.listItemLeftIcon} />
                <ListItemText primary="Display" />
                <OpenInNewIcon />
              </ListItem>
            </List>
          </Fragment>
        )}
      </Fragment>
    );
  };

  render() {
    const {
      data: { task, error },
    } = this.props;
    const { artifactsLoading } = this.state;

    return (
      <Dashboard title="Interactive Connect">
        <Fragment>
          {!error && artifactsLoading && <Spinner loading />}
          <ErrorPanel fixed error={error} />
          {!artifactsLoading && task && this.renderTask()}
        </Fragment>
      </Dashboard>
    );
  }
}
