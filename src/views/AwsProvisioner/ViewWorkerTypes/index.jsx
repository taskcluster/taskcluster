import { hot } from 'react-hot-loader';
import React, { Component, Fragment } from 'react';
import { graphql } from 'react-apollo';
import Spinner from '@mozilla-frontend-infra/components/Spinner';
import { withStyles } from '@material-ui/core/styles';
import PlusIcon from 'mdi-react/PlusIcon';
import HeartPulseIcon from 'mdi-react/HeartPulseIcon';
import AlertCircleOutlineIcon from 'mdi-react/AlertCircleOutlineIcon';
import Dashboard from '../../../components/Dashboard';
import Search from '../../../components/Search';
import SpeedDial from '../../../components/SpeedDial';
import SpeedDialAction from '../../../components/SpeedDialAction';
import HelpView from '../../../components/HelpView';
import AwsProvisionerWorkerTypeTable from '../../../components/AwsProvisionerWorkerTypeTable';
import ErrorPanel from '../../../components/ErrorPanel';
import workerTypesQuery from './workerTypes.graphql';
import Button from '../../../components/Button';

@hot(module)
@graphql(workerTypesQuery)
@withStyles(theme => ({
  alertIcon: {
    ...theme.mixins.warningIcon,
  },
  heartIcon: {
    ...theme.mixins.errorIcon,
  },
  createIcon: {
    ...theme.mixins.successIcon,
  },
  createIconSpan: {
    ...theme.mixins.fab,
    right: theme.spacing.unit * 11,
  },
}))
export default class ViewRoles extends Component {
  state = {
    workerTypeSearch: '',
  };

  handleCreate = () => {
    this.props.history.push('/aws-provisioner/create');
  };

  handleHealthClick = () => {
    this.props.history.push('/aws-provisioner/aws-health');
  };

  handleRecentErrorsClick = () => {
    this.props.history.push('/aws-provisioner/recent-errors');
  };

  handleWorkerTypeSearchSubmit = workerTypeSearch => {
    this.setState({ workerTypeSearch });
  };

  render() {
    const {
      classes,
      description,
      data: { loading, error, awsProvisionerWorkerTypeSummaries },
    } = this.props;
    const { workerTypeSearch } = this.state;

    return (
      <Dashboard
        title="AWS Provisioner Worker Types"
        helpView={<HelpView description={description} />}
        search={
          <Search
            disabled={loading}
            onSubmit={this.handleWorkerTypeSearchSubmit}
            placeholder="Worker type contains"
          />
        }>
        <Fragment>
          {!awsProvisionerWorkerTypeSummaries && loading && <Spinner loading />}
          <ErrorPanel error={error} />
          {awsProvisionerWorkerTypeSummaries && (
            <AwsProvisionerWorkerTypeTable
              searchTerm={workerTypeSearch}
              workerTypes={awsProvisionerWorkerTypeSummaries}
            />
          )}
          <Button
            spanProps={{ className: classes.createIconSpan }}
            tooltipProps={{ title: 'Create Worker Type' }}
            requiresAuth
            variant="round"
            className={classes.createIcon}
            onClick={this.handleCreate}>
            <PlusIcon />
          </Button>
          <SpeedDial>
            <SpeedDialAction
              tooltipOpen
              icon={<AlertCircleOutlineIcon />}
              tooltipTitle="Recent Provisioning Errors"
              className={classes.alertIcon}
              onClick={this.handleRecentErrorsClick}
            />
            <SpeedDialAction
              tooltipOpen
              icon={<HeartPulseIcon />}
              tooltipTitle="Health"
              className={classes.heartIcon}
              onClick={this.handleHealthClick}
            />
          </SpeedDial>
        </Fragment>
      </Dashboard>
    );
  }
}
