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
import Spinner from '../../../components/Spinner';
import { getArtifactUrl } from '../../../utils/getArtifactUrl';
import {
  decodeArtifactName,
  getRawArtifactName,
} from '../../../utils/artifactNames';
import { withAuth } from '../../../utils/Auth';
import {
  invalidateAnonymousScopes,
  isPublicArtifact,
  withAnonymousScopes,
} from '../../../utils/anonymousScopes';
import { withTaskclusterClient } from '../../../utils/TaskclusterClient';

@withAuth
@withAnonymousScopes
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
    // set when the unsigned URL of a public log fails to load
    forceSign: false,
  };

  // Guards against out-of-order responses when the task ID changes while a
  // fetch is in flight, and against updating state after unmounting.
  requestId = 0;

  componentDidMount() {
    this.load();
  }

  componentDidUpdate(prevProps) {
    if (prevProps.match.url !== this.props.match.url) {
      this.setState({ forceSign: false });
    }

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

  getLogName() {
    const {
      match: {
        params: { taskId, runId, name: artifactName },
      },
      stream,
    } = this.props;
    const artifactPath = `/tasks/${taskId}/runs/${runId}/logs/${stream ? 'live/' : ''}`;
    const rawArtifactName = getRawArtifactName(artifactPath, artifactName);

    return decodeArtifactName(rawArtifactName);
  }

  getLogUrl() {
    const {
      user,
      anonymousScopes,
      match: {
        params: { taskId, runId },
      },
    } = this.props;
    const name = this.getLogName();

    return getArtifactUrl({
      user,
      anonymousScopes: this.state.forceSign ? null : anonymousScopes,
      taskId,
      runId,
      name,
    });
  }

  handleLogError = error => {
    const { user, anonymousScopes } = this.props;

    // retry once with a signed URL; if that fails too, Log shows the error
    if (
      [401, 403].includes(error.status) &&
      !this.state.forceSign &&
      user?.credentials &&
      isPublicArtifact(anonymousScopes, this.getLogName())
    ) {
      invalidateAnonymousScopes();
      this.setState({ forceSign: true });
    }
  };

  goToLog() {
    // as log url contains bewit, the link could expire
    // raw logs will be opened in new tab/window
    const url = this.getLogUrl();

    window.open(url, '_blank', 'noopener noreferrer');
  }

  render() {
    const { classes, match, stream, anonymousScopesLoaded } = this.props;
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
        {!anonymousScopesLoaded ? (
          <Spinner loading />
        ) : (
          <Log
            url={url}
            stream={stream}
            onError={this.handleLogError}
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
        )}
      </Dashboard>
    );
  }

  handleTaskSearchSubmit = taskId => {
    this.props.history.push(`/tasks/${taskId}`);
  };
}
