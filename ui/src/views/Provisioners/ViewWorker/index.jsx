import { hot } from 'react-hot-loader';
import React, { Component, Fragment } from 'react';
import { graphql, withApollo } from 'react-apollo';
import { format, parseISO, addYears, isAfter } from 'date-fns';
import Spinner from '@mozilla-frontend-infra/components/Spinner';
import TextField from '@material-ui/core/TextField';
import Typography from '@material-ui/core/Typography';
import { withStyles } from '@material-ui/core/styles';
import HomeLockIcon from 'mdi-react/HomeLockIcon';
import HammerIcon from 'mdi-react/HammerIcon';
import HomeLockOpenIcon from 'mdi-react/HomeLockOpenIcon';
import Dashboard from '../../../components/Dashboard';
import WorkerDetailsCard from '../../../components/WorkerDetailsCard';
import DialogAction from '../../../components/DialogAction';
import SpeedDial from '../../../components/SpeedDial';
import SpeedDialAction from '../../../components/SpeedDialAction';
import WorkerTable from '../../../components/WorkerTable';
import Breadcrumbs from '../../../components/Breadcrumbs';
import Link from '../../../utils/Link';
import { withAuth } from '../../../utils/Auth';
import ErrorPanel from '../../../components/ErrorPanel';
import workerQuery from './worker.graphql';
import quarantineWorkerQuery from './quarantineWorker.graphql';

@hot(module)
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
            </Fragment>
          )}
        </Fragment>
      </Dashboard>
    );
  }
}
