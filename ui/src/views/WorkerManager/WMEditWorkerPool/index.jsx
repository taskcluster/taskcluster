import { hot } from 'react-hot-loader';
import React, { Component } from 'react';
import { bool } from 'prop-types';
import TextField from '@material-ui/core/TextField/TextField';
import FormGroup from '@material-ui/core/FormGroup/FormGroup';
import FormControlLabel from '@material-ui/core/FormControlLabel/FormControlLabel';
import FormLabel from '@material-ui/core/FormLabel/FormLabel';
import MenuItem from '@material-ui/core/MenuItem/MenuItem';
import CodeEditor from '@mozilla-frontend-infra/components/CodeEditor';
import ListItem from '@material-ui/core/ListItem/ListItem';
import Switch from '@material-ui/core/Switch/Switch';
import { withStyles } from '@material-ui/core';
import CheckIcon from 'mdi-react/CheckIcon';
import List from '../../Documentation/components/List';
import isWorkerTypeNameValid from '../../../utils/isWorkerTypeNameValid';
import Dashboard from '../../../components/Dashboard';
import Button from '../../../components/Button';

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

@hot(module)
@withStyles(theme => ({
  successIcon: {
    ...theme.mixins.successIcon,
  },
  createIconSpan: {
    ...theme.mixins.fab,
    ...theme.mixins.actionButton,
    right: theme.spacing.unit * 11,
  },
}))
export default class WMWorkerPoolEditor extends Component {
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
      providerType: 'gcp',
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

  render() {
    const { isNewWorkerPool, classes } = this.props;
    const { workerPool, invalidProviderConfig } = this.state;

    return (
      <Dashboard
        title={
          isNewWorkerPool
            ? 'Worker Manager: Create Worker Type'
            : 'Worker Manager: Edit Worker Type'
        }>
        <TextField
          label="Enter Worker Type Name..."
          name="name"
          error={
            Boolean(workerPool.name) && !isWorkerTypeNameValid(workerPool.name)
          }
          onChange={this.handleInputChange}
          fullWidth
          value={workerPool.name}
          margin="normal"
        />

        <TextField
          label="Enter Worker Type Description..."
          name="description"
          onChange={this.handleInputChange}
          fullWidth
          value={workerPool.description}
          margin="normal"
        />

        <TextField
          label="Enter Owner's Email..."
          name="owner"
          error={Boolean(workerPool.owner) && !workerPool.owner.includes('@')}
          onChange={this.handleInputChange}
          fullWidth
          value={workerPool.owner}
          margin="normal"
        />

        <FormGroup>
          <FormControlLabel
            control={
              <Switch
                checked={workerPool.wantsEmail}
                onChange={this.handleSwitchChange}
                value="wantsEmail"
              />
            }
            label="Receive emails about errors"
          />
        </FormGroup>

        <FormGroup classes={classes.group}>
          <FormLabel component="provider">Provider:</FormLabel>
          <TextField
            id="select-provider-type"
            select
            label="Type:"
            helperText="Which service do you want to run your tasks in?"
            value={workerPool.providerType}
            name="providerType"
            onChange={this.handleInputChange}
            margin="normal">
            <MenuItem value="gcp">GCP</MenuItem>
          </TextField>

          <TextField
            label="Name:"
            value={workerPool.providerId}
            name="providerId"
            onChange={this.handleInputChange}
            margin="normal"
          />

          <List>
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
          </List>
        </FormGroup>
        <Button
          spanProps={{ className: classes.createIconSpan }}
          disabled={invalidProviderConfig}
          tooltipProps={{ title: 'Save' }}
          onClick={this.handleCreateWorkerPool}
          classes={{ root: classes.successIcon }}
          variant="round">
          <CheckIcon />
        </Button>
      </Dashboard>
    );
  }
}
