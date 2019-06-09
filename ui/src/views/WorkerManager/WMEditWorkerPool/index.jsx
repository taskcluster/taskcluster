import { hot } from 'react-hot-loader';
import React, { Component } from 'react';
import { withApollo, graphql } from 'react-apollo';
import { bool } from 'prop-types';
import Typography from '@material-ui/core/Typography';
import TextField from '@material-ui/core/TextField';
import FormControlLabel from '@material-ui/core/FormControlLabel';
import ListSubheader from '@material-ui/core/ListSubheader';
import MenuItem from '@material-ui/core/MenuItem';
import CodeEditor from '@mozilla-frontend-infra/components/CodeEditor';
import ListItem from '@material-ui/core/ListItem';
import Switch from '@material-ui/core/Switch';
import { withStyles } from '@material-ui/core';
import ContentSaveIcon from 'mdi-react/ContentSaveIcon';
import List from '../../Documentation/components/List';
import isWorkerTypeNameValid from '../../../utils/isWorkerTypeNameValid';
import Button from '../../../components/Button';
import Dashboard from '../../../components/Dashboard';
import createWorkerPoolQuery from './createWorkerPool.graphql';
import workerPoolQuery from './workerPool.graphql';
import { joinWorkerPoolId } from '../../../utils/workerPool';
import formatError from '../../../utils/formatError';
import ErrorPanel from '../../../components/ErrorPanel';

const gcp = 'GCP';
const providers = new Map();
const providerConfigs = new Map();

providers.set(`${gcp}`, 'google');

providerConfigs.set(`${gcp}`, {
  minCapacity: 0,
  maxCapacity: 0,
  capacityPerInstance: 1,
  machineType: 'n1-highcpu-8',
  regions: ['us-west2'],
  userData: {},
  scheduling: {},
  networkInterfaces: [{}],
  disks: [{}],
});

@hot(module)
@withApollo
@graphql(workerPoolQuery, {
  skip: props => !props.match.params.workerPoolId || props.isNewWorkerPool,
  options: ({ match: { params } }) => ({
    fetchPolicy: 'network-only',
    variables: {
      workerPoolId: decodeURIComponent(params.workerPoolId),
    },
  }),
})
@withStyles(theme => ({
  successIcon: {
    ...theme.mixins.successIcon,
  },
  createIconSpan: {
    ...theme.mixins.fab,
    ...theme.mixins.actionButton,
  },
  dropdown: {
    minWidth: 200,
  },
  list: {
    paddingLeft: 0,
    paddingRight: 0,
  },
  middleList: {
    paddingTop: theme.spacing.unit * 7,
    paddingBottom: theme.spacing.unit * 9,
    paddingLeft: 0,
    paddingRight: 0,
  },
  separator: {
    padding: theme.spacing.double,
    paddingBottom: 0,
  },
}))
export default class WMEditWorkerPool extends Component {
  static defaultProps = {
    isNewWorkerPool: true,
  };

  static propTypes = {
    isNewWorkerPool: bool,
  };

  state = {
    workerPool: {
      workerPoolId1: '',
      workerPoolId2: '',
      description: '',
      owner: '',
      emailOnError: false,
      config: providerConfigs.get(gcp),
    },
    providerType: gcp,
    invalidProviderConfig: false,
    actionLoading: false,
    error: null,
  };



  handleSwitchChange = event => {
    const {
      target: { value },
    } = event;

    this.setState({
      workerPool: {
        ...this.state.workerPool,
        [value]: !this.state.workerPool[value],
      },
    });
  };

  handleEditorChange = value => {
    const { workerPool } = this.state;

    try {
      workerPool.config = JSON.parse(value);

      this.setState({
        workerPool,
        invalidProviderConfig: false,
      });
    } catch (err) {
      workerPool.config = value;

      this.setState({
        workerPool,
        invalidProviderConfig: true,
      });
    }
  };

  handleProviderTypeChange = event => {
    const {
      target: { value },
    } = event;

    this.setState({
      providerType: value,
      workerPool: {
        ...this.state.workerPool,
        config: providerConfigs.get(value),
      },
    });
  };

  handleCreateWorkerPool = async () => {
    const { workerPoolId1, workerPoolId2, ...payload } = this.state.workerPool;

    payload.providerId = providers.get(this.state.providerType);

    this.setState({ error: null, actionLoading: true });

    try {
      await this.props.client.mutate({
        mutation: createWorkerPoolQuery,
        variables: {
          workerPoolId: joinWorkerPoolId(workerPoolId1, workerPoolId2),
          payload,
        },
      });

      this.props.history.push('/worker-manager');
    } catch (error) {
      this.setState({ error: formatError(error), actionLoading: false });
    }
  };

  render() {
    const { isNewWorkerPool, classes } = this.props;
    const {
      workerPool,
      providerType,
      invalidProviderConfig,
      actionLoading,
      error,
    } = this.state;

    return (
      <Dashboard
        title={isNewWorkerPool ? 'Create Worker Pool' : 'Edit Worker Pool'}>
        <ErrorPanel fixed error={error} />

      </Dashboard>
    );
  }
}
