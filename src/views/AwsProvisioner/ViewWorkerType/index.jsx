import { hot } from 'react-hot-loader';
import React, { Component } from 'react';
import { graphql, withApollo } from 'react-apollo';
import ErrorPanel from '@mozilla-frontend-infra/components/ErrorPanel';
import Spinner from '@mozilla-frontend-infra/components/Spinner';
import { withStyles } from '@material-ui/core/styles';
import Tabs from '@material-ui/core/Tabs';
import Tab from '@material-ui/core/Tab';
import Tooltip from '@material-ui/core/Tooltip';
import DeleteEmptyIcon from 'mdi-react/DeleteEmptyIcon';
import Dashboard from '../../../components/Dashboard';
import Button from '../../../components/Button';
import AwsProvisionerErrorsTable from '../../../components/AwsProvisionerErrorsTable';
import AwsProvisionerHealthTable from '../../../components/AwsProvisionerHealthTable';
import AwsProvisionerWorkerTypeStatus from '../../../components/AwsProvisionerWorkerTypeStatus';
import Ec2ResourcesTable from '../../../components/Ec2ResourcesTable';
import formatError from '../../../utils/formatError';
import workerTypeQuery from './workerType.graphql';
import terminateInstanceQuery from './terminateInstance.graphql';
import terminateWorkerTypeQuery from './terminateWorkerType.graphql';

@hot(module)
@withApollo
@graphql(workerTypeQuery, {
  options: props => ({
    variables: {
      workerType: props.match.params.workerType,
    },
  }),
})
@withStyles(theme => ({
  fab: {
    ...theme.mixins.fab,
  },
  spinner: {
    marginTop: theme.spacing.double,
  },
  terminateButton: {
    ...theme.mixins.errorIcon,
  },
}))
export default class ViewWorkerType extends Component {
  state = {
    currentTab: 0,
    actionLoading: false,
  };

  handleTabChange = (e, currentTab) => {
    this.setState({ currentTab });
  };

  handleTerminateAllInstances = async () => {
    const {
      client,
      match: {
        params: { workerType },
      },
    } = this.props;

    try {
      this.setState({ actionLoading: true, error: null });

      await client.mutate({
        mutation: terminateWorkerTypeQuery,
        variables: { workerType },
      });

      this.setState({ actionLoading: false });
    } catch (error) {
      this.setState({ actionLoading: false, error: formatError(error) });
    }
  };

  handleTerminateInstance = async ({ region, id }) => {
    try {
      this.setState({ actionLoading: true, error: null });

      await this.props.client.mutate({
        mutation: terminateInstanceQuery,
        variables: { region, instanceId: id },
      });

      this.setState({ actionLoading: false });
    } catch (error) {
      this.setState({ actionLoading: false, error: formatError(error) });
    }
  };

  render() {
    const {
      classes,
      data: {
        awsProvisionerWorkerTypeState,
        awsProvisionerWorkerTypeErrors,
        awsProvisionerWorkerTypeHealth,
        awsProvisionerWorkerType,
        loading,
        error,
      },
      match: {
        params: { workerType },
      },
    } = this.props;
    const { currentTab, actionLoading } = this.state;

    return (
      <Dashboard title={`AWS Provisioner ${workerType}`}>
        {error && error.graphQLErrors && <ErrorPanel error={error} />}
        {this.state.error && <ErrorPanel error={this.state.error} />}
        <Tabs fullWidth value={currentTab} onChange={this.handleTabChange}>
          <Tab label="Status" />
          <Tab label="Errors" />
          <Tab label="Health" />
          <Tab label="EC2 Resources" />
        </Tabs>
        {loading && <Spinner className={classes.spinner} loading />}
        {!error &&
          !loading &&
          currentTab === 0 && (
            <AwsProvisionerWorkerTypeStatus
              workerType={awsProvisionerWorkerType}
              awsState={awsProvisionerWorkerTypeState}
            />
          )}
        {!error &&
          !loading &&
          currentTab === 1 && (
            <AwsProvisionerErrorsTable
              errors={awsProvisionerWorkerTypeErrors}
            />
          )}
        {!error &&
          !loading &&
          currentTab === 2 && (
            <AwsProvisionerHealthTable
              healthData={awsProvisionerWorkerTypeHealth}
            />
          )}
        {!error &&
          !loading &&
          currentTab === 3 && (
            <Ec2ResourcesTable
              onTerminateInstance={this.handleTerminateInstance}
              workerType={awsProvisionerWorkerType}
              awsState={awsProvisionerWorkerTypeState}
              actionLoading={actionLoading}
            />
          )}
        {!error &&
          !loading &&
          currentTab === 3 && (
            <Tooltip title="Terminate All">
              <div className={classes.fab}>
                <Button
                  disabled={
                    actionLoading ||
                    awsProvisionerWorkerTypeState.instances.length === 0
                  }
                  requiresAuth
                  onClick={this.handleTerminateAllInstances}
                  variant="fab"
                  className={classes.terminateButton}
                >
                  <DeleteEmptyIcon />
                </Button>
              </div>
            </Tooltip>
          )}
      </Dashboard>
    );
  }
}
