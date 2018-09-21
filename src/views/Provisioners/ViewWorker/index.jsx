import { hot } from 'react-hot-loader';
import { Component, Fragment } from 'react';
import { graphql, withApollo } from 'react-apollo';
import { format, addYears, isAfter } from 'date-fns';
import ErrorPanel from '@mozilla-frontend-infra/components/ErrorPanel';
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
import workerQuery from './worker.graphql';
import quarantineWorkerQuery from './quarantineWorker.graphql';

@hot(module)
@withApollo
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
      dialogOpen: false,
      dialogTitle: null,
      dialogBody: null,
      quarantineUntilInput:
        props.worker && props.worker.quarantineUntil
          ? props.worker.quarantineUntil
          : addYears(new Date(), 1000),
    };
  }

  handleDialogOpen = action => {
    this.setState({
      dialogOpen: true,
      ...(action
        ? {
            dialogTitle: action.title,
            dialogBody: action.description,
          }
        : null),
    });
  };

  handleDialogClose = () => {
    this.setState({
      dialogOpen: false,
      dialogTitle: null,
      dialogBody: null,
    });
  };

  // TODO: Add action logic
  handleDialogSubmit = () => {};

  handleQuarantineDialogSubmit = () => {
    const {
      provisionerId,
      workerType,
      workerGroup,
      workerId,
    } = this.props.match.params;

    return this.props.client.mutate({
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
  };

  handleQuarantineChange = ({ target }) => {
    this.setState({ quarantineUntilInput: target.value });
  };

  render() {
    const {
      data: { loading, error, worker },
    } = this.props;
    const {
      dialogOpen,
      dialogTitle,
      dialogBody,
      quarantineUntilInput,
    } = this.state;

    return (
      <Dashboard title="Worker">
        <Fragment>
          {loading && <Spinner loading />}
          {error && error.graphQLErrors && <ErrorPanel error={error} />}
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
                  ButtonProps={{ color: 'secondary' }}
                />
                {worker.actions.map(action => (
                  <SpeedDialAction
                    requiresAuth
                    tooltipOpen
                    key={action.title}
                    icon={<HammerIcon />}
                    onClick={() => this.handleDialogOpen(action)}
                    ButtonProps={{ color: 'secondary' }}
                    tooltipTitle={
                      <div>
                        <div>{action.title}</div>
                        <div>{action.description}</div>
                      </div>
                    }
                  />
                ))}
              </SpeedDial>
              {dialogOpen &&
                (dialogTitle ? (
                  <DialogAction
                    open={dialogOpen}
                    title={dialogTitle}
                    body={dialogBody}
                    confirmText={dialogTitle}
                    onSubmit={this.handleQuarantineDialogSubmit}
                    onClose={this.handleDialogClose}
                  />
                ) : (
                  <DialogAction
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
                    onSubmit={this.handleDialogSubmit}
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
