import { hot } from 'react-hot-loader';
import { Component, Fragment } from 'react';
import { graphql } from 'react-apollo';
import { Link } from 'react-router-dom';
import ErrorPanel from '@mozilla-frontend-infra/components/ErrorPanel';
import Spinner from '@mozilla-frontend-infra/components/Spinner';
import { withStyles } from '@material-ui/core/styles';
import PlusIcon from 'mdi-react/PlusIcon';
import HeartPulseIcon from 'mdi-react/HeartPulseIcon';
import AlertCircleOutlineIcon from 'mdi-react/AlertCircleOutlineIcon';
import SpeedDialAction from '@material-ui/lab/SpeedDialAction';
import Dashboard from '../../../components/Dashboard';
import Search from '../../../components/Search';
import SpeedDial from '../../../components/SpeedDial';
import AwsProvisionerWorkerTypeTable from '../../../components/AwsProvisionerWorkerTypeTable';
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
  };

  handleWorkerTypeSearchChange = ({ target }) => {
    this.setState({ workerTypeSearch: target.value });
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

  render() {
    const {
      classes,
      data: { loading, error, awsProvisionerWorkerTypeSummaries },
    } = this.props;
    const { workerTypeSearch } = this.state;

    return (
      <Dashboard
        title="AWS Provisioner Worker Types"
        search={
          <Search
            disabled={loading}
            value={workerTypeSearch}
            onChange={this.handleWorkerTypeSearchChange}
            placeholder="Worker type starts with"
          />
        }>
        <Fragment>
          {!awsProvisionerWorkerTypeSummaries && loading && <Spinner loading />}
          {error && error.graphQLErrors && <ErrorPanel error={error} />}
          {awsProvisionerWorkerTypeSummaries && (
            <AwsProvisionerWorkerTypeTable
              searchTerm={workerTypeSearch}
              workerTypes={awsProvisionerWorkerTypeSummaries}
            />
          )}
          <SpeedDial>
            <SpeedDialAction
              icon={<PlusIcon />}
              tooltipTitle="Create Worker Type"
              onClick={this.handleCreate}
              ButtonProps={{ color: 'secondary' }}
            />
            <SpeedDialAction
              icon={<AlertCircleOutlineIcon />}
              tooltipTitle="Recent Errors"
              classes={{ button: classes.alertIcon }}
              component={Link}
              onChange={this.handleRecentErrorsClick}
              to="/aws-provisioner/recent-errors"
              ButtonProps={{ color: 'secondary' }}
            />
            <SpeedDialAction
              icon={<HeartPulseIcon />}
              tooltipTitle="Health"
              classes={{ button: classes.heartIcon }}
              onClick={this.handleHealthClick}
              component={Link}
              to="/aws-provisioner/aws-health"
              ButtonProps={{ color: 'secondary' }}
            />
          </SpeedDial>
        </Fragment>
      </Dashboard>
    );
  }
}
