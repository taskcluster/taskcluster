import { hot } from 'react-hot-loader';
import React, { Component } from 'react';
import { withApollo } from 'react-apollo';
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

  handleInputChange = ({ target: { name, value } }) => {
    this.setState({ workerPool: { ...this.state.workerPool, [name]: value } });
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

      this.setState({ error: null, actionLoading: false });
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
        <List className={classes.list}>
          <ListSubheader>Worker Pool ID</ListSubheader>
          <ListItem>
            <TextField
              name="workerPoolId1"
              error={
                Boolean(workerPool.workerPoolId1) &&
                !isWorkerTypeNameValid(workerPool.workerPoolId1) &&
                workerPool.workerPoolId2 === workerPool.workerPoolId1
              }
              onChange={this.handleInputChange}
              fullWidth
              value={workerPool.workerPoolId1}
            />
            <Typography className={classes.separator} variant="h5">
              /
            </Typography>
            <TextField
              name="workerPoolId2"
              error={
                Boolean(workerPool.workerPoolId2) &&
                !isWorkerTypeNameValid(workerPool.workerPoolId2) &&
                workerPool.workerPoolId2 === workerPool.workerPoolId1
              }
              onChange={this.handleInputChange}
              fullWidth
              value={workerPool.workerPoolId2}
            />
          </ListItem>
        </List>

        <List className={classes.list}>
          <ListItem>
            <TextField
              label="Description"
              name="description"
              onChange={this.handleInputChange}
              fullWidth
              value={workerPool.description}
              margin="normal"
            />
          </ListItem>

          <ListItem>
            <TextField
              label="Owner's Email"
              name="owner"
              error={
                Boolean(workerPool.owner) && !workerPool.owner.includes('@')
              }
              onChange={this.handleInputChange}
              fullWidth
              value={workerPool.owner}
              margin="normal"
            />
          </ListItem>

          <ListItem>
            <FormControlLabel
              control={
                <Switch
                  checked={workerPool.emailOnError}
                  onChange={this.handleSwitchChange}
                  value="wantsEmail"
                />
              }
              label="Email the owner about errors"
            />
          </ListItem>
        </List>

        <List className={classes.middleList}>
          <ListSubheader>Provider</ListSubheader>
          <ListItem>
            <TextField
              id="select-provider-type"
              className={classes.dropdown}
              select
              helperText="Which cloud do you want to run your tasks in?"
              value={providerType}
              name="providerType"
              onChange={this.handleProviderTypeChange}
              margin="normal">
              {Array.from(providers.keys()).map(p => (
                <MenuItem key={p} value={p}>
                  {p}
                </MenuItem>
              ))}
            </TextField>
          </ListItem>
        </List>

        <List className={classes.list}>
          <ListSubheader>Configuration:</ListSubheader>
          <ListItem>
            <CodeEditor
              value={JSON.stringify(workerPool.config, null, 2)}
              onChange={this.handleEditorChange}
              lint
            />
          </ListItem>

          <Button
            spanProps={{ className: classes.createIconSpan }}
            disabled={invalidProviderConfig || actionLoading}
            requiresAuth
            tooltipProps={{ title: 'Save Worker Pool' }}
            onClick={this.handleCreateWorkerPool}
            classes={{ root: classes.successIcon }}
            variant="round">
            <ContentSaveIcon />
          </Button>
        </List>
      </Dashboard>
    );
  }
}
