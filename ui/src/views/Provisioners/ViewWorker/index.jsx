import React, { Component, Fragment } from 'react';
import { graphql, withApollo } from 'react-apollo';
import { format, parseISO, addYears, isAfter } from 'date-fns';
import Typography from '@material-ui/core/Typography';
import { withStyles } from '@material-ui/core/styles';
import HomeLockIcon from 'mdi-react/HomeLockIcon';
import HammerIcon from 'mdi-react/HammerIcon';
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

@withApollo
@withAuth
@graphql(workerQuery, {
  skip: props => !props.match.params.provisionerId,
  options: ({ match: { params } }) => ({
    fetchPolicy: 'network-only',
    errorPolicy: 'all',
    variables: params,
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
      quarantineUntilInput:
        props.worker && props.worker.quarantineUntil
          ? parseISO(props.worker.quarantineUntil)
          : addYears(new Date(), 1000),
    };
  }

  handleActionDialogOpen = selectedAction => {
    this.setState({
      dialogOpen: true,
      selectedAction,
    });
  };

  handleActionError = e => {
    this.setState({ dialogError: e, actionLoading: false });
  };

  handleDialogClose = () => {
    this.setState({
      dialogOpen: false,
      selectedAction: null,
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

  handleQuarantineDialogSubmit = async () => {
    const {
      provisionerId,
      workerType,
      workerGroup,
      workerId,
    } = this.props.match.params;

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
        },
      },
      refetchQueries: ['ViewWorker'],
    });

    this.setState({ actionLoading: false });
  };

  handleWorkerContextActionSubmit = async () => {
    const { selectedAction } = this.state;
    const {
      user,
      match: { params },
    } = this.props;
    const url = selectedAction.url
      .replace('<provisionerId>', params.provisionerId)
      .replace('<workerType>', params.workerType)
      .replace('<workerGroup>', params.workerGroup)
      .replace('<workerId>', params.workerId);

    this.setState({ actionLoading: true, dialogError: null });

    // TODO: Action not working.
    await fetch(url, {
      method: selectedAction.method,
      headers: new Headers({
        'Content-Type': 'application/json',
        Authorization: `Bearer ${btoa(JSON.stringify(user.credentials))}`,
      }),
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

  render() {
    const {
      classes,
      data: { loading, error, worker },
      match: { params },
    } = this.props;
    const {
      dialogOpen,
      selectedAction,
      actionLoading,
      quarantineUntilInput,
      dialogError,
      terminateDialogError,
      terminateDialogOpen,
      terminateDialogTitle,
      terminateDialogBody,
      terminateDialogConfirmText,
    } = this.state;
    const graphqlError = this.getError(error);

    return (
      <Dashboard title="Worker">
        <Fragment>
          {loading && <Spinner loading />}
          <ErrorPanel fixed error={graphqlError} />
          {worker && (
            <Fragment>
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
              <br />
              <WorkerDetailsCard worker={worker} />
              <br />
              <WorkerTable worker={worker} />
              <SpeedDial>
                <SpeedDialAction
                  tooltipOpen
                  requiresAuth
                  icon={
                    isAfter(
                      worker.quarantineUntil || new Date(),
                      new Date()
                    ) ? (
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
                {worker.providerId !== NULL_PROVIDER && (
                  <SpeedDialAction
                    tooltipOpen
                    requiresAuth
                    icon={<DeleteIcon />}
                    tooltipTitle="Terminate Worker"
                    onClick={() =>
                      this.handleTerminateDialogActionOpen(
                        worker.workerId,
                        worker.workerGroup,
                        worker.workerPoolId
                      )
                    }
                    FabProps={{
                      disabled: terminateDisabled(
                        worker.state,
                        worker.providerId
                      ),
                    }}
                  />
                )}
                {worker.actions.map(action => (
                  <SpeedDialAction
                    requiresAuth
                    tooltipOpen
                    key={action.title}
                    icon={<HammerIcon />}
                    onClick={() => this.handleActionDialogOpen(action)}
                    FabProps={{
                      disabled: actionLoading,
                    }}
                    tooltipTitle={action.title}
                  />
                ))}
              </SpeedDial>
              {dialogOpen &&
                (selectedAction ? (
                  <DialogAction
                    error={dialogError}
                    open={dialogOpen}
                    title={`${selectedAction.title}?`}
                    body={selectedAction.description}
                    confirmText={selectedAction.title}
                    onSubmit={this.handleWorkerContextActionSubmit}
                    onError={this.handleActionError}
                    onClose={this.handleDialogClose}
                  />
                ) : (
                  <DialogAction
                    error={dialogError}
                    open={dialogOpen}
                    title="Quarantine?"
                    body={
                      <Fragment>
                        <Fragment>
                          Quarantining a worker allows the machine to remain
                          alive but not accept jobs. Note that a quarantine can
                          be lifted by setting &quot;Quarantine Until&quot; to
                          the present time or somewhere in the past.
                        </Fragment>
                        <br />
                        <br />
                        <TextField
                          id="date"
                          label="Quarantine Until"
                          type="date"
                          value={format(quarantineUntilInput, 'yyyy-MM-dd')}
                          onChange={this.handleQuarantineChange}
                        />
                      </Fragment>
                    }
                    confirmText={
                      worker.quarantineUntil ? 'Update' : 'Quarantine'
                    }
                    onSubmit={this.handleQuarantineDialogSubmit}
                    onError={this.handleActionError}
                    onComplete={this.handleDialogClose}
                    onClose={this.handleDialogClose}
                  />
                ))}
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
          )}
        </Fragment>
      </Dashboard>
    );
  }
}
