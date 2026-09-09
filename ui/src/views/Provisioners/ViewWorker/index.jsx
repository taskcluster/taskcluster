import React, { Component, Fragment } from 'react';
import { Queue, WorkerManager } from '@taskcluster/client-web';
import { format, parseISO, addYears, isAfter } from 'date-fns';
import Typography from '@material-ui/core/Typography';
import { withStyles } from '@material-ui/core/styles';
import HomeLockIcon from 'mdi-react/HomeLockIcon';
import HomeLockOpenIcon from 'mdi-react/HomeLockOpenIcon';
import DeleteIcon from 'mdi-react/DeleteIcon';
import Spinner from '../../../components/Spinner';
import TextField from '../../../components/TextField';
import Dashboard from '../../../components/Dashboard';
import WorkerDetailsCard from '../../../components/WorkerDetailsCard';
import DialogAction from '../../../components/DialogAction';
import SpeedDial from '../../../components/SpeedDial';
import SpeedDialAction from '../../../components/SpeedDialAction';
import WorkerTable from '../../../components/WorkerTable';
import Breadcrumbs from '../../../components/Breadcrumbs';
import Link from '../../../utils/Link';
import { NULL_PROVIDER } from '../../../utils/constants';
import { withAuth } from '../../../utils/Auth';
import { removeWorker } from '../../../utils/client';
import { terminateDisabled } from '../../../utils/terminate';
import ErrorPanel from '../../../components/ErrorPanel';
import { withTaskclusterClient } from '../../../utils/TaskclusterClient';
import { joinWorkerPoolId } from '../../../utils/workerPool';

@withAuth
@withTaskclusterClient
@withStyles(theme => ({
  link: {
    ...theme.mixins.link,
  },
}))
export default class ViewWorker extends Component {
  constructor(props) {
    super(props);

    this.state = {
      loading: false,
      error: null,
      worker: null,
      workerManagerWorker: null,
      dialogError: null,
      dialogOpen: false,
      terminateDialogError: null,
      terminateDialogOpen: false,
      terminateDialogTitle: '',
      terminateDialogBody: '',
      terminateDialogConfirmText: '',
      quarantineUntilInput: addYears(new Date(), 1000),
      quarantineInfo: '',
    };
  }

  componentDidMount() {
    if (this.props.match.params.provisionerId) {
      this.fetchWorker();
    }
  }

  componentDidUpdate(prevProps) {
    const { params } = this.props.match;
    const { params: prevParams } = prevProps.match;

    if (
      params.provisionerId !== prevParams.provisionerId ||
      params.workerType !== prevParams.workerType ||
      params.workerGroup !== prevParams.workerGroup ||
      params.workerId !== prevParams.workerId
    ) {
      this.fetchWorker();
    }
  }

  get queue() {
    return this.props.createTaskclusterClient({ Class: Queue });
  }

  get workerManager() {
    return this.props.createTaskclusterClient({ Class: WorkerManager });
  }

  fetchWorker = async () => {
    const { provisionerId, workerType, workerGroup, workerId } =
      this.props.match.params;
    const workerPoolId = joinWorkerPoolId(provisionerId, workerType);

    this.setState({ loading: true, error: null });

    let worker = null;
    let workerManagerWorker = null;
    let workerError = null;
    let workerManagerWorkerError = null;

    try {
      worker = await this.workerManager.getWorker(
        provisionerId,
        workerType,
        workerGroup,
        workerId
      );
    } catch (err) {
      workerError = err;
    }

    try {
      workerManagerWorker = await this.workerManager.worker(
        workerPoolId,
        workerGroup,
        workerId
      );
    } catch (err) {
      workerManagerWorkerError = err;
    }

    if (!worker && !workerManagerWorker) {
      this.setState({
        loading: false,
        error: workerError ?? workerManagerWorkerError,
        worker: null,
        workerManagerWorker: null,
      });

      return;
    }

    this.setState({
      loading: false,
      error: null,
      worker: worker ? await this.enrichRecentTasks(worker) : null,
      workerManagerWorker,
      quarantineUntilInput: worker?.quarantineUntil
        ? parseISO(worker.quarantineUntil)
        : addYears(new Date(), 1000),
    });
  };

  // Replaces the GraphQL resolver that decorated each recent task with its run
  // status and metadata. `recentTasks` only carries `{ taskId, runId }`, so we
  // load the run (from the task status) and the task metadata per entry.
  enrichRecentTasks = async worker => {
    const recentTasks = worker.recentTasks ?? [];
    const { queue } = this;
    const [statuses, tasks] = await Promise.all([
      Promise.all(
        recentTasks.map(({ taskId }) =>
          queue
            .status(taskId)
            .then(({ status }) => status)
            .catch(() => null)
        )
      ),
      Promise.all(
        recentTasks.map(({ taskId }) => queue.task(taskId).catch(() => null))
      ),
    ]);

    return {
      ...worker,
      recentTasks: recentTasks.map((recentTask, index) => ({
        taskId: recentTask.taskId,
        runId: recentTask.runId,
        run: statuses[index]?.runs?.[recentTask.runId],
      })),
      latestTasks: tasks.map(task =>
        task ? { metadata: task.metadata } : null
      ),
    };
  };

  handleActionError = e => {
    this.setState({ dialogError: e, actionLoading: false });
  };

  handleDialogClose = () => {
    this.setState({
      dialogOpen: false,
    });
  };

  handleDialogOpen = () => {
    this.setState({
      dialogOpen: true,
    });
  };

  handleQuarantineChange = ({ target }) => {
    this.setState({ quarantineUntilInput: parseISO(target.value) });
  };

  handleQuarantineInfoChange = ({ target }) => {
    this.setState({ quarantineInfo: target.value });
  };

  handleQuarantineDialogSubmit = async () => {
    const { provisionerId, workerType, workerGroup, workerId } =
      this.props.match.params;

    this.setState({ actionLoading: true, dialogError: null });

    await this.queue.quarantineWorker(
      provisionerId,
      workerType,
      workerGroup,
      workerId,
      {
        quarantineUntil: new Date(
          this.state.quarantineUntilInput
        ).toISOString(),
        quarantineInfo: this.state.quarantineInfo,
      }
    );

    this.setState({ actionLoading: false });

    await this.fetchWorker();
  };

  handleTerminateDialogActionOpen = (workerId, workerGroup, workerPoolId) => {
    this.setState({
      terminateDialogOpen: true,
      terminateDialogTitle: 'Terminate Worker?',
      terminateDialogBody: `This will terminate the worker with id ${workerId} in group ${workerGroup} within worker pool ${workerPoolId}.`,
      terminateDialogConfirmText: 'Terminate Worker',
      workerPoolId,
      workerGroup,
      workerId,
    });
  };

  handleTerminateDeleteClick = async () => {
    const { workerPoolId, workerGroup, workerId } = this.state;
    const { user } = this.props;

    this.setState({
      terminateDialogError: null,
    });

    try {
      await removeWorker({ workerPoolId, workerGroup, workerId, user });
      this.setState({
        terminateDialogOpen: false,
      });
      await this.fetchWorker();
    } catch (terminateDialogError) {
      this.handleTerminateDialogActionError(terminateDialogError);
    }
  };

  handleTerminateDialogActionError = terminateDialogError => {
    this.setState({
      terminateDialogError,
    });
  };

  handleTerminateDialogActionClose = () => {
    this.setState({
      terminateDialogError: null,
      terminateDialogOpen: false,
    });
  };

  renderBreadcrumbs() {
    const {
      classes,
      match: { params },
    } = this.props;

    return (
      <Breadcrumbs>
        <Link to="/provisioners">
          <Typography variant="body2" className={classes.link}>
            Workers
          </Typography>
        </Link>
        <Link to={`/provisioners/${params.provisionerId}`}>
          <Typography variant="body2" className={classes.link}>
            {params.provisionerId}
          </Typography>
        </Link>
        <Link
          to={`/provisioners/${params.provisionerId}/worker-types/${params.workerType}`}>
          <Typography variant="body2" className={classes.link}>
            {params.workerType}
          </Typography>
        </Link>
        <Typography variant="body2" color="textSecondary">
          {`${params.workerGroup}`}
        </Typography>
        <Typography variant="body2" color="textSecondary">
          {`${params.workerId}`}
        </Typography>
      </Breadcrumbs>
    );
  }

  renderMenu(includeQueueActions = true) {
    const {
      worker,
      workerManagerWorker,
      dialogOpen,
      actionLoading,
      quarantineUntilInput,
      quarantineInfo,
      dialogError,
      terminateDialogError,
      terminateDialogOpen,
      terminateDialogTitle,
      terminateDialogBody,
      terminateDialogConfirmText,
    } = this.state;
    const terminateWorker = worker ?? workerManagerWorker;

    return (
      <Fragment>
        <SpeedDial>
          {includeQueueActions && (
            <SpeedDialAction
              tooltipOpen
              requiresAuth
              icon={
                isAfter(worker.quarantineUntil || new Date(), new Date()) ? (
                  <HomeLockOpenIcon />
                ) : (
                  <HomeLockIcon />
                )
              }
              tooltipTitle={
                worker.quarantineUntil ? 'Update Quarantine' : 'Quarantine'
              }
              onClick={this.handleDialogOpen}
              FabProps={{
                disabled: actionLoading,
              }}
            />
          )}
          {terminateWorker && terminateWorker.providerId !== NULL_PROVIDER && (
            <SpeedDialAction
              tooltipOpen
              requiresAuth
              icon={<DeleteIcon />}
              tooltipTitle="Terminate Worker"
              onClick={() =>
                this.handleTerminateDialogActionOpen(
                  terminateWorker.workerId,
                  terminateWorker.workerGroup,
                  terminateWorker.workerPoolId
                )
              }
              FabProps={{
                disabled: terminateDisabled(
                  terminateWorker.state,
                  terminateWorker.providerId
                ),
              }}
            />
          )}
        </SpeedDial>
        {dialogOpen && (
          <DialogAction
            error={dialogError}
            open={dialogOpen}
            title="Quarantine?"
            body={
              <Fragment>
                Quarantining a worker allows the machine to remain alive but not
                accept jobs. Note that a quarantine can be lifted by setting
                &quot;Quarantine Until&quot; to the present time or somewhere in
                the past.
                <br />
                <br />
                <TextField
                  id="date"
                  label="Quarantine Until"
                  type="date"
                  value={format(quarantineUntilInput, 'yyyy-MM-dd')}
                  onChange={this.handleQuarantineChange}
                />
                <br />
                <TextField
                  id="info"
                  label="Quarantine comment"
                  type="text"
                  fullWidth
                  value={quarantineInfo}
                  onChange={this.handleQuarantineInfoChange}
                />
              </Fragment>
            }
            confirmText={worker.quarantineUntil ? 'Update' : 'Quarantine'}
            onSubmit={this.handleQuarantineDialogSubmit}
            onError={this.handleActionError}
            onComplete={this.handleDialogClose}
            onClose={this.handleDialogClose}
          />
        )}
        {terminateDialogOpen && (
          <DialogAction
            error={terminateDialogError}
            open={terminateDialogOpen}
            title={terminateDialogTitle}
            body={terminateDialogBody}
            confirmText={terminateDialogConfirmText}
            onSubmit={this.handleTerminateDeleteClick}
            onError={this.handleTerminateDialogActionError}
            onClose={this.handleTerminateDialogActionClose}
          />
        )}
      </Fragment>
    );
  }

  renderQueueWorker() {
    const { worker, workerManagerWorker } = this.state;
    // Merged view to include both queue and worker-manager data
    const mergedView = {
      ...workerManagerWorker,
      ...worker,
    };

    return (
      <Fragment>
        {this.renderBreadcrumbs()}
        <br />
        <WorkerDetailsCard worker={mergedView} />
        <br />
        <WorkerTable worker={worker} />
        {this.renderMenu(true)}
      </Fragment>
    );
  }

  renderWorkerManagerWorker() {
    const { workerManagerWorker } = this.state;

    return (
      <Fragment>
        {this.renderBreadcrumbs()}
        <br />
        <WorkerDetailsCard worker={workerManagerWorker} />
        <br />
        <WorkerTable worker={{ recentTasks: [] }} />
        {this.renderMenu(false)}
      </Fragment>
    );
  }

  render() {
    const { loading, error, worker, workerManagerWorker } = this.state;

    return (
      <Dashboard title="Worker">
        {loading && <Spinner loading />}
        <ErrorPanel fixed error={error} />
        {worker && this.renderQueueWorker()}
        {!worker && workerManagerWorker && this.renderWorkerManagerWorker()}
      </Dashboard>
    );
  }
}
