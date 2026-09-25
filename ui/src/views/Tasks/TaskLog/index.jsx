import React, { Component, Fragment } from 'react';
import { Queue } from '@taskcluster/client-web';
import { withStyles } from '@material-ui/core/styles';
import ArrowLeftIcon from 'mdi-react/ArrowLeftIcon';
import OpenInNewIcon from 'mdi-react/OpenInNewIcon';
import Dashboard from '../../../components/Dashboard';
import Button from '../../../components/Button';
import Log from '../../../components/Log';
import Link from '../../../utils/Link';
import Helmet from '../../../components/Helmet';
import Search from '../../../components/Search';
import ErrorPanel from '../../../components/ErrorPanel';
import { getArtifactUrl } from '../../../utils/getArtifactUrl';
import {
  decodeArtifactName,
  getRawArtifactName,
} from '../../../utils/artifactNames';
import { withAuth } from '../../../utils/Auth';
import { withTaskclusterClient } from '../../../utils/TaskclusterClient';

@withAuth
@withTaskclusterClient
@withStyles(theme => ({
  fab: {
    ...theme.mixins.fab,
    ...theme.mixins.actionButton,
    bottom: theme.spacing(3),
    right: theme.spacing(12),
  },
  rawLog: {
    ...theme.mixins.fab,
    ...theme.mixins.actionButton,
    bottom: theme.spacing(3),
    right: theme.spacing(3),
  },
}))
export default class TaskLog extends Component {
  state = {
    task: null,
    status: null,
  };

  // Guards against out-of-order responses when the task ID changes while a
  // fetch is in flight, and against updating state after unmounting.
  requestId = 0;

  componentDidMount() {
    this.load();
  }

  componentDidUpdate(prevProps) {
    if (prevProps.match.params.taskId !== this.props.match.params.taskId) {
      this.setState({ task: null, status: null });
      this.load();
    }
  }

  componentWillUnmount() {
    this.requestId += 1;
  }

  // The task name and run state only decorate the page title and favicon;
  // the log itself is fetched by the Log component. Either request failing
  // (e.g. missing scopes or an expired task) leaves that part blank rather
  // than hiding the log.
  load = async () => {
    const {
      createTaskclusterClient,
      match: {
        params: { taskId },
      },
    } = this.props;
    const id = ++this.requestId;
    const queue = createTaskclusterClient({ Class: Queue });
    const [task, status] = await Promise.allSettled([
      queue.task(taskId),
      queue.status(taskId),
    ]);

    if (id !== this.requestId) {
      return;
    }

    this.setState({
      task: task.status === 'fulfilled' ? task.value : null,
      status: status.status === 'fulfilled' ? status.value.status : null,
    });
  };

  getCurrentRun() {
    return this.state.status?.runs[this.props.match.params.runId];
  }

  getLogUrl() {
    const {
      user,
      match: {
        params: { taskId, runId, name: artifactName },
      },
      stream,
    } = this.props;
    const artifactPath = `/tasks/${taskId}/runs/${runId}/logs/${stream ? 'live/' : ''}`;
    const rawArtifactName = getRawArtifactName(artifactPath, artifactName);
    const name = decodeArtifactName(rawArtifactName);

    return getArtifactUrl({ user, taskId, runId, name });
  }

  goToLog() {
    // as log url contains bewit, the link could expire
    // raw logs will be opened in new tab/window
    const url = this.getLogUrl();

    window.open(url, '_blank', 'noopener noreferrer');
  }

  render() {
    const { classes, match, stream } = this.props;
    const { task } = this.state;
    const url = this.getLogUrl();
    const run = this.getCurrentRun();

    if (!url) {
      return (
        <ErrorPanel error={new Error('Could not determine log artifact URL')} />
      );
    }

    return (
      <Dashboard
        title={task ? `Log "${task.metadata.name}"` : 'Log'}
        disableTitleFormatting
        disablePadding
        search={
          <Search
            placeholder="Search Task ID"
            onSubmit={this.handleTaskSearchSubmit}
          />
        }>
        <Helmet state={run?.state} />
        <Log
          url={url}
          stream={stream}
          actions={
            <Fragment>
              <Link
                to={`/tasks/${match.params.taskId}/runs/${match.params.runId}`}>
                <Button
                  spanProps={{ className: classes.fab }}
                  tooltipProps={{ title: 'View Task' }}
                  variant="circular"
                  color="secondary">
                  <ArrowLeftIcon />
                </Button>
              </Link>
              <Button
                onClick={() => this.goToLog()}
                spanProps={{ className: classes.rawLog }}
                tooltipProps={{ title: 'Raw Log' }}
                variant="circular"
                color="secondary">
                <OpenInNewIcon size={20} />
              </Button>
            </Fragment>
          }
        />
      </Dashboard>
    );
  }

  handleTaskSearchSubmit = taskId => {
    this.props.history.push(`/tasks/${taskId}`);
  };
}
