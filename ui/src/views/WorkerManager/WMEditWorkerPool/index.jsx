import React, { Component } from 'react';
import { Queue, WorkerManager } from '@taskcluster/client-web';
import { bool } from 'prop-types';
import { Typography, Box } from '@material-ui/core';
import Spinner from '../../../components/Spinner';
import Dashboard from '../../../components/Dashboard';
import WMWorkerPoolEditor from '../../../components/WMWorkerPoolEditor';
import ErrorPanel from '../../../components/ErrorPanel';
import Breadcrumbs from '../../../components/Breadcrumbs';
import Link from '../../../utils/Link';
import { splitWorkerPoolId } from '../../../utils/workerPool';
import WorkersNavbar from '../../../components/WorkersNavbar';
import { withTaskclusterClient } from '../../../utils/TaskclusterClient';
import { VIEW_PROVIDERS_PAGE_SIZE } from '../../../utils/constants';

@withTaskclusterClient
export default class WMEditWorkerPool extends Component {
  state = {
    loading: true,
    providers: [],
    providersTruncated: false,
    workerPool: null,
    errorStats: null,
    error: null,
    errorStatsError: null,
    dialogError: null,
    dialogOpen: false,
  };

  static defaultProps = {
    isNewWorkerPool: false,
  };

  static propTypes = {
    isNewWorkerPool: bool,
  };

  componentDidMount() {
    this.load();
  }

  get workerManagerClient() {
    return this.props.createTaskclusterClient({ Class: WorkerManager });
  }

  get queueClient() {
    return this.props.createTaskclusterClient({ Class: Queue });
  }

  get workerPoolId() {
    return decodeURIComponent(this.props.match.params.workerPoolId ?? '');
  }

  load = async () => {
    const { isNewWorkerPool } = this.props;

    this.setState({ loading: true, error: null });

    try {
      const [{ providers, continuationToken }, workerPool] = await Promise.all([
        this.loadProviders(),
        isNewWorkerPool ? null : this.loadWorkerPool(),
      ]);

      this.setState({
        loading: false,
        providers,
        providersTruncated: Boolean(continuationToken),
        workerPool,
      });
    } catch (error) {
      this.setState({ loading: false, error });

      return;
    }

    if (!isNewWorkerPool) {
      this.loadErrorStats();
    }
  };

  loadProviders = () =>
    this.workerManagerClient.listProviders({
      limit: VIEW_PROVIDERS_PAGE_SIZE,
    });

  loadWorkerPool = async () => {
    const { workerPoolId } = this;
    const [workerPool, pendingTasks] = await Promise.all([
      this.workerManagerClient.workerPool(workerPoolId),
      // `pendingTasks` was a field on the WorkerPool resolver, which read it
      // from the queue -- a worker pool id is also a task queue id. A user who
      // cannot read the count gets a blank tile rather than a failed page.
      this.queueClient
        .pendingTasks(workerPoolId)
        .then(result => result.pendingTasks)
        .catch(() => null),
    ]);

    return { ...workerPool, pendingTasks };
  };

  loadErrorStats = async () => {
    try {
      const errorStats = await this.workerManagerClient.workerPoolErrorStats({
        workerPoolId: this.workerPoolId,
      });

      this.setState({ errorStats, errorStatsError: null });
    } catch (errorStatsError) {
      this.setState({ errorStatsError });
    }
  };

  createWorkerPoolRequest = ({ workerPoolId, payload }) =>
    this.workerManagerClient.createWorkerPool(workerPoolId, payload);

  updateWorkerPoolRequest = ({ workerPoolId, payload }) =>
    this.workerManagerClient.updateWorkerPool(workerPoolId, payload);

  deleteRequest = ({ workerPoolId }) => {
    this.setState({ dialogError: null });

    // Note that deleting a worker pool doesn't really "delete" it, but just
    // marks it as to be deleted (NULL_PROVISIONER).
    return this.workerManagerClient.deleteWorkerPool(workerPoolId);
  };

  handleDialogActionError = error => {
    this.setState({ dialogError: error });
  };

  handleDialogActionComplete = () => {
    this.props.history.push('/worker-manager');
  };

  handleDialogActionClose = () => {
    this.setState({
      dialogOpen: false,
      dialogError: null,
    });
  };

  handleDialogActionOpen = () => {
    this.setState({ dialogOpen: true });
  };

  render() {
    const {
      loading,
      providers,
      providersTruncated,
      workerPool,
      errorStats,
      error,
      errorStatsError,
      dialogError,
      dialogOpen,
    } = this.state;
    const { isNewWorkerPool } = this.props;
    const { workerPoolId } = this;

    // detect a ridiculous number of providers and let the user know
    if (providersTruncated) {
      const err = new Error(
        'This deployment has a lot of providers; not all can be displayed here.'
      );

      return <ErrorPanel fixed error={err} />;
    }

    return (
      <Dashboard
        disableTitleFormatting
        title={
          isNewWorkerPool
            ? 'Create Worker Pool'
            : `Worker Pool "${workerPoolId}"`
        }>
        <Box
          marginBottom={2}
          sx={{
            display: 'flex',
            width: '100%',
            flexWrap: 'wrap',
            alignItems: 'center',
          }}>
          <div style={{ flexGrow: 1, marginRight: 8 }}>
            <Breadcrumbs style={{ flexGrow: 1, marginRight: 8 }}>
              <Link to="/worker-manager">
                <Typography variant="body2">Worker Manager</Typography>
              </Link>
              <Typography variant="body2" color="textSecondary">
                {workerPoolId}
              </Typography>
              {workerPoolId && (
                <WorkersNavbar
                  provisionerId={splitWorkerPoolId(workerPoolId).provisionerId}
                  workerType={splitWorkerPoolId(workerPoolId).workerType}
                  hasWorkerPool
                />
              )}
            </Breadcrumbs>
          </div>
        </Box>

        <ErrorPanel fixed error={error} />
        <ErrorPanel
          warning
          error={
            errorStatsError &&
            `Failed to load worker pool error stats: ${errorStatsError.message}`
          }
        />
        {loading && <Spinner loading />}
        {!loading &&
          (isNewWorkerPool ? (
            <WMWorkerPoolEditor
              saveRequest={this.createWorkerPoolRequest}
              providers={providers}
              isNewWorkerPool
            />
          ) : (
            workerPool && (
              <WMWorkerPoolEditor
                workerPool={workerPool}
                errorStats={errorStats}
                providers={providers}
                saveRequest={this.updateWorkerPoolRequest}
                deleteRequest={this.deleteRequest}
                dialogError={dialogError}
                dialogOpen={dialogOpen}
                onDialogActionError={this.handleDialogActionError}
                onDialogActionComplete={this.handleDialogActionComplete}
                onDialogActionClose={this.handleDialogActionClose}
                onDialogActionOpen={this.handleDialogActionOpen}
              />
            )
          ))}
      </Dashboard>
    );
  }
}
