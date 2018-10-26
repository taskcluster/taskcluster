import { hot } from 'react-hot-loader';
import React, { Component, Fragment } from 'react';
import { Link } from 'react-router-dom';
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
import ConsoleIcon from 'mdi-react/ConsoleIcon';
import MonitorIcon from 'mdi-react/MonitorIcon';
import LinkIcon from 'mdi-react/LinkIcon';
import OpenInNewIcon from 'mdi-react/OpenInNewIcon';
import Dashboard from '../../../components/Dashboard';
import Search from '../../../components/Search';
import Markdown from '../../../components/Markdown';
import StatusLabel from '../../../components/StatusLabel';
import ErrorPanel from '../../../components/ErrorPanel';
import taskQuery from './task.graphql';
import {
  INITIAL_CURSOR,
  INTERACTIVE_TASK_STATUS,
  TASK_STATE,
  INTERACTIVE_CONNECT_TASK_POLL_INTERVAL,
} from '../../../utils/constants';

let previousCursor;

@hot(module)
@graphql(taskQuery, {
  options: props => ({
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
    margin: `${theme.spacing.double}px 0`,
  },
  warningPanel: {
    marginTop: theme.spacing.double,
    marginBottom: theme.spacing.double,
  },
  viewTaskDetails: {
    marginTop: theme.spacing.double,
  },
}))
export default class InteractiveConnect extends Component {
  static getDerivedStateFromProps(
    props,
    { displayUrl, shellUrl, artifactsLoading, previousTaskId }
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
      };
    }

    // Stop polling when we have both URLs
    if (shellUrl && displayUrl) {
      props.data.stopPolling();
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
    taskIdSearch: this.props.match.params.taskId,
    // eslint-disable-next-line react/no-unused-state
    previousTaskId: this.props.match.params.taskId,
  };

  componentDidUpdate(prevProps) {
    const {
      data: { task, fetchMore, refetch },
      match: {
        params: { taskId },
      },
    } = this.props;

    if (prevProps.match.params.taskId !== taskId) {
      previousCursor = INITIAL_CURSOR;

      return refetch({
        pollInterval: INTERACTIVE_CONNECT_TASK_POLL_INTERVAL,
        variables: {
          taskId: this.props.match.params.taskId,
        },
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

  getInteractiveStatus = () => {
    const { shellUrl, displayUrl } = this.state;
    const { status } = this.props.data.task;

    if (!shellUrl || !displayUrl) {
      return INTERACTIVE_TASK_STATUS.WAITING;
    }

    if (
      [TASK_STATE.COMPLETED, TASK_STATE.FAILED, TASK_STATE.EXCEPTION].includes(
        status.state
      )
    ) {
      return INTERACTIVE_TASK_STATUS.RESOLVED;
    }

    return INTERACTIVE_TASK_STATUS.READY;
  };

  handleDisplayOpen = () => {
    window.open(this.state.displayUrl, '_blank');
  };

  handleShellOpen = () => {
    window.open(this.state.shellUrl, '_blank');
  };

  handleTaskIdSearchChange = ({ target: { value } }) => {
    this.setState({ taskIdSearch: value || '' });
  };

  handleTaskIdSearchSubmit = e => {
    e.preventDefault();

    const { taskIdSearch } = this.state;

    if (taskIdSearch && this.props.match.params.taskId !== taskIdSearch) {
      this.props.history.push(`/tasks/${this.state.taskIdSearch}/connect`);
    }
  };

  renderTask = () => {
    const {
      classes,
      data: { task },
      match: {
        params: { taskId },
      },
    } = this.props;
    const interactiveStatus = this.getInteractiveStatus();
    const isSessionReady = interactiveStatus === INTERACTIVE_TASK_STATUS.READY;
    const isSessionResolved =
      interactiveStatus === INTERACTIVE_TASK_STATUS.RESOLVED;

    return (
      <Fragment>
        {isSessionReady && (
          <ErrorPanel
            className={classes.warningPanel}
            warning
            error="This is not a development environment! Interactive
              tasks can help debug issues, but note that these workers may be spot
              nodes that can be terminated at any time."
          />
        )}
        {isSessionResolved && (
          <ErrorPanel
            warning
            error="You can not attach to an interactive task after it has stopped
          running."
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
          <ListItem
            button
            className={classNames(
              classes.listItemButton,
              classes.viewTaskDetails
            )}
            component={Link}
            to={`/tasks/${taskId}`}
          >
            <ListItemText primary="View task details" />
            <LinkIcon />
          </ListItem>
        </List>
        {isSessionReady && (
          <Fragment>
            <Divider className={classes.divider} />
            <Typography variant="h5">Select a Session</Typography>
            <Typography>
              You have approximately <strong>5 minutes</strong> to connect,
              after that the task will shutdown when all connections are closed.
            </Typography>
            <List>
              <ListItem
                button
                onClick={this.handleShellOpen}
                className={classes.listItemButton}
              >
                <ConsoleIcon />
                <ListItemText primary="Shell" />
                <OpenInNewIcon />
              </ListItem>
              <ListItem
                onClick={this.handleDisplayOpen}
                button
                className={classes.listItemButton}
              >
                <MonitorIcon />
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
    const { artifactsLoading, taskIdSearch } = this.state;

    return (
      <Dashboard
        title="Interactive Connect"
        search={
          <Search
            value={taskIdSearch}
            onChange={this.handleTaskIdSearchChange}
            onSubmit={this.handleTaskIdSearchSubmit}
          />
        }
      >
        <Fragment>
          {!error && artifactsLoading && <Spinner loading />}
          <ErrorPanel error={error} />
          {!error && !artifactsLoading && task && this.renderTask()}
        </Fragment>
      </Dashboard>
    );
  }
}
