import { hot } from 'react-hot-loader';
import React, { Component } from 'react';
import { bool } from 'prop-types';
import TextField from '@material-ui/core/TextField';
import FormControlLabel from '@material-ui/core/FormControlLabel';
import FormLabel from '@material-ui/core/FormLabel';
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

const gcpConfig = {
  minCapacity: 0,
  maxCapacity: 0,
  capacityPerInstance: 1,
  machineType: 'n1-highcpu-8',
  regions: ['us-west2'],
  userData: {},
  scheduling: {},
  networkInterfaces: [{}],
  disks: [{}],
};
const providers = {
  GCP: 'google',
};

@hot(module)
@withStyles(theme => ({
  successIcon: {
    ...theme.mixins.successIcon,
  },
  createIconSpan: {
    ...theme.mixins.fab,
    ...theme.mixins.actionButton,
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
      name: '',
      description: '',
      owner: '',
      wantsEmail: false,
      providerType: providers.GCP,
      providerId: '',
      config: gcpConfig,
    },
    invalidProviderConfig: false,
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

  handleCreateWorkerPool = () => {};

  render() {
    const { isNewWorkerPool, classes } = this.props;
    const { workerPool, invalidProviderConfig } = this.state;

    return (
      <Dashboard
        title={isNewWorkerPool ? 'Create Worker Pool' : 'Edit Worker Pool'}>
        <List>
          <ListItem>
            <TextField
              label="Name"
              name="name"
              error={
                Boolean(workerPool.name) &&
                !isWorkerTypeNameValid(workerPool.name)
              }
              onChange={this.handleInputChange}
              fullWidth
              value={workerPool.name}
              margin="normal"
            />
          </ListItem>

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
                  checked={workerPool.wantsEmail}
                  onChange={this.handleSwitchChange}
                  value="wantsEmail"
                />
              }
              label="Email the owner about errors"
            />
          </ListItem>

          <ListItem>
            <FormLabel component="provider">Provider:</FormLabel>
          </ListItem>
          <List>
            <ListItem>
              <TextField
                id="select-provider-type"
                select
                label="Type:"
                helperText="Which service do you want to run your tasks in?"
                value={workerPool.providerType}
                name="providerType"
                onChange={this.handleInputChange}
                margin="normal">
                {Object.keys(providers).map(p => (
                  <MenuItem key={p} value={p}>
                    {p}
                  </MenuItem>
                ))}
              </TextField>
            </ListItem>

            <ListItem>
              <TextField
                label="Name"
                value={workerPool.providerId}
                name="providerId"
                onChange={this.handleInputChange}
                margin="normal"
              />
            </ListItem>
          </List>

          <ListItem>
            <FormLabel component="config">Configuration:</FormLabel>
          </ListItem>
          <ListItem>
            <CodeEditor
              value={JSON.stringify(workerPool.config, null, 2)}
              onChange={this.handleEditorChange}
              lint
            />
          </ListItem>

          <Button
            spanProps={{ className: classes.createIconSpan }}
            disabled={invalidProviderConfig}
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
