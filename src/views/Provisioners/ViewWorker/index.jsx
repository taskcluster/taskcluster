import { hot } from 'react-hot-loader';
import React, { Component, Fragment } from 'react';
import { graphql, withApollo } from 'react-apollo';
import { format, addYears, isAfter } from 'date-fns';
import Spinner from '@mozilla-frontend-infra/components/Spinner';
import HammerIcon from 'mdi-react/HammerIcon';
import TextField from '@material-ui/core/TextField';
import HomeLockIcon from 'mdi-react/HomeLockIcon';
import HomeLockOpenIcon from 'mdi-react/HomeLockOpenIcon';
import Dashboard from '../../../components/Dashboard';
import WorkerDetailsCard from '../../../components/WorkerDetailsCard';
import DialogAction from '../../../components/DialogAction';
import SpeedDial from '../../../components/SpeedDial';
import SpeedDialAction from '../../../components/SpeedDialAction';
import WorkerTable from '../../../components/WorkerTable';
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
    variables: params,
  }),
})
export default class ViewWorker extends Component {
  constructor(props) {
    super(props);

    this.state = {
      dialogError: null,
      dialogOpen: false,
      quarantineUntilInput:
        props.worker && props.worker.quarantineUntil
          ? props.worker.quarantineUntil
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
    this.setState({ quarantineUntilInput: target.value });
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

  render() {
    const {
      data: { loading, error, worker },
    } = this.props;
    const {
      dialogOpen,
      selectedAction,
      actionLoading,
      quarantineUntilInput,
      dialogError,
    } = this.state;

    return (
      <Dashboard title="Worker">
        <Fragment>
          {loading && <Spinner loading />}
          <ErrorPanel error={error} />
          {worker && (
            <Fragment>
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
                  ButtonProps={{
                    color: 'secondary',
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
                    ButtonProps={{
                      color: 'secondary',
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
                          value={format(quarantineUntilInput, 'YYYY-MM-DD')}
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
