import React, { Component, Fragment } from 'react';
import { graphql, withApollo } from '@apollo/client/react/hoc';
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
import workerQuery from './worker.graphql';
import quarantineWorkerQuery from './quarantineWorker.graphql';
import { joinWorkerPoolId } from '../../../utils/workerPool';

@withApollo
@withAuth
@graphql(workerQuery, {
  skip: props => !props.match.params.provisionerId,
  options: ({ match: { params } }) => ({
    fetchPolicy: 'network-only',
    errorPolicy: 'all',
    variables: {
      workerPoolId: joinWorkerPoolId(params.provisionerId, params.workerType),
      ...params,
    },
  }),
})
@withStyles(theme => ({
  link: {
    ...theme.mixins.link,
  },
}))
export default class ViewWorker extends Component {
  constructor(props) {
    super(props);

    this.state = {
      dialogError: null,
      dialogOpen: false,
      terminateDialogError: null,
      terminateDialogOpen: false,
      terminateDialogTitle: '',
      terminateDialogBody: '',
      terminateDialogConfirmText: '',
      quarantineUntilInput: props.worker?.quarantineUntil
        ? parseISO(props.worker.quarantineUntil)
        : addYears(new Date(), 1000),
      quarantineInfo: '',
    };
  }

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

    await this.props.client.mutate({
      mutation: quarantineWorkerQuery,
      variables: {
        provisionerId,
        workerType,
        workerGroup,
        workerId,
        payload: {
          quarantineUntil: new Date(
            this.state.quarantineUntilInput
          ).toISOString(),
          quarantineInfo: this.state.quarantineInfo,
        },
      },
      refetchQueries: ['ViewWorker'],
    });

    this.setState({ actionLoading: false });
  };

  getError(error) {
    if (!error) {
      return null;
    }

    if (typeof error === 'string') {
      return error;
    }

    return error.graphQLErrors.find(error => {
      return !(
        error.statusCode === 404 &&
        (error.path.includes('recentTasks') ||
          error.path.includes('latestTasks'))
      );
    });
  }

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
      data: { worker, WorkerManagerWorker },
    } = this.props;
    const {
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
    const terminateWorker = worker ?? WorkerManagerWorker;

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
    const {
      data: { worker, WorkerManagerWorker },
    } = this.props;
    // Merged view to include both queue and worker-manager data
    const mergedView = {
      ...WorkerManagerWorker,
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
    const {
      data: { WorkerManagerWorker },
    } = this.props;

    return (
      <Fragment>
        {this.renderBreadcrumbs()}
        <br />
        <WorkerDetailsCard worker={WorkerManagerWorker} />
        <br />
        <WorkerTable worker={{ recentTasks: [] }} />
        {this.renderMenu(false)}
      </Fragment>
    );
  }

  render() {
    const {
      data: { loading, error, worker, WorkerManagerWorker },
    } = this.props;
    // we hide graphql errors if we have any worker data
    const graphqlError =
      !WorkerManagerWorker && !worker && this.getError(error);

    return (
      <Dashboard title="Worker">
        {loading && <Spinner loading />}
        <ErrorPanel fixed error={graphqlError} />
        {worker && this.renderQueueWorker()}
        {!worker && WorkerManagerWorker && this.renderWorkerManagerWorker()}
      </Dashboard>
    );
  }
}
