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

@hot(module)
@graphql(workerTypesQuery)
@withStyles(theme => ({
  alertIcon: {
    ...theme.mixins.warningIcon,
  },
  heartIcon: {
    ...theme.mixins.errorIcon,
  },
}))
export default class ViewRoles extends Component {
  state = {
    workerTypeSearch: '',
    workerTypeSearchText: '',
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

  handleWorkerTypeSearchChange = ({ target }) => {
    this.setState({ workerTypeSearchText: target.value });
  };

  handleWorkerTypeSearchSubmit = e => {
    e.preventDefault();

    this.setState({ workerTypeSearch: this.state.workerTypeSearchText });
  };

  render() {
    const {
      classes,
      description,
      data: { loading, error, awsProvisionerWorkerTypeSummaries },
    } = this.props;
    const { workerTypeSearch, workerTypeSearchText } = this.state;

    return (
      <Dashboard
        title="AWS Provisioner Worker Types"
        helpView={<HelpView description={description} />}
        search={
          <Search
            disabled={loading}
            value={workerTypeSearchText}
            onChange={this.handleWorkerTypeSearchChange}
            onSubmit={this.handleWorkerTypeSearchSubmit}
            placeholder="Worker type contains"
          />
        }
      >
        <Fragment>
          {!awsProvisionerWorkerTypeSummaries && loading && <Spinner loading />}
          <ErrorPanel error={error} />
          {awsProvisionerWorkerTypeSummaries && (
            <AwsProvisionerWorkerTypeTable
              searchTerm={workerTypeSearch}
              workerTypes={awsProvisionerWorkerTypeSummaries}
            />
          )}
          <SpeedDial>
            <SpeedDialAction
              tooltipOpen
              icon={<PlusIcon />}
              tooltipTitle="Create Worker Type"
              onClick={this.handleCreate}
              ButtonProps={{ color: 'secondary' }}
            />
            <SpeedDialAction
              tooltipOpen
              icon={<AlertCircleOutlineIcon />}
              tooltipTitle="Recent Provisioning Errors"
              classes={{ button: classes.alertIcon }}
              onClick={this.handleRecentErrorsClick}
              ButtonProps={{ color: 'secondary' }}
            />
            <SpeedDialAction
              tooltipOpen
              icon={<HeartPulseIcon />}
              tooltipTitle="Health"
              classes={{ button: classes.heartIcon }}
              onClick={this.handleHealthClick}
              ButtonProps={{ color: 'secondary' }}
            />
          </SpeedDial>
        </Fragment>
      </Dashboard>
    );
  }
}
