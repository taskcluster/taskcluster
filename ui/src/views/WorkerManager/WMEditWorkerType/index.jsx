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
export default class WMWorkerTypeEditor extends Component {
  static defaultProps = {
    isNewWorkerType: true,
  };

  static propTypes = {
    isNewWorkerType: bool,
  };

  state = {
    workerType: {
      name: '',
      description: '',
      owner: '',
      wantsEmail: false,
      providerType: '',
      providerId: '',
      config: {},
    },
  };

  handleInputChange = ({ target: { name, value } }) => {
    console.log('🦔', this.state);
    this.setState({ workerType: { ...this.state.workerType, [name]: value } });
    console.log('🐾', this.state);
  };

  handleSwitchChange = event => {
    console.log('🐣', this.state);
    const {
      target: { value },
    } = event;

    this.setState({
      workerType: {
        ...this.state.workerType,
        [value]: !this.state.workerType[value],
      },
    });
    console.log('🐥', this.state);
  };

  handleEditorChange = value => {
    try {
      JSON.parse(value);

      this.setState({ ...this.state.workerType, config: value });
    } catch (err) {
      this.setState({ config: '' });
    }
  };

  render() {
    const { isNewWorkerType, classes } = this.props;
    const { workerType } = this.state;

    return (
      <Dashboard
        title={
          isNewWorkerType
            ? 'Worker Manager: Create Worker Type'
            : 'Worker Manager: Edit Worker Type'
        }>
        <TextField
          label="Enter Worker Type Name..."
          name="name"
          error={
            Boolean(workerType.name) && !isWorkerTypeNameValid(workerType.name)
          }
          onChange={this.handleInputChange}
          fullWidth
          value={this.state.workerType.name}
          margin="normal"
        />

        <TextField
          label="Enter Worker Type Description..."
          name="description"
          onChange={this.handleInputChange}
          fullWidth
          value={this.state.workerType.description}
          margin="normal"
        />

        <TextField
          label="Enter Owner's Email..."
          name="owner"
          error={Boolean(workerType.owner) && !workerType.owner.includes('@')}
          onChange={this.handleInputChange}
          fullWidth
          value={this.state.workerType.owner}
          margin="normal"
        />

        <FormGroup>
          <FormControlLabel
            control={
              <Switch
                checked={this.state.workerType.wantsEmail}
                onChange={this.handleSwitchChange}
                value="wantsEmail"
              />
            }
            label="Receive emails about errors"
          />
        </FormGroup>

        <FormGroup>
          <FormLabel component="provider">Provider:</FormLabel>
          <TextField
            id="select-provider-type"
            select
            label="Type:"
            helperText="Which service do you want to run your tasks in?"
            value={this.state.workerType.providerType}
            name="providerType"
            onChange={this.handleInputChange}
            margin="normal">
            <MenuItem value="gcp">GCP</MenuItem>
            <MenuItem value="aws">AWS</MenuItem>
            <MenuItem value="packet">Packet.net</MenuItem>
          </TextField>

          <TextField
            label="Name:"
            value={this.state.workerType.providerId}
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
                value="Config depending on which provider type was selected"
                onChange={this.handleEditorChange}
                lint
              />
            </ListItem>
          </List>
        </FormGroup>
        <Button
          spanProps={{ className: classes.createIconSpan }}
          tooltipProps={{ title: 'Save' }}
          onClick={this.handleCreateWorkerType}
          // disabled={
          //   invalidDefinition ||
          //   !isWorkerTypeNameValid(workerType) ||
          //   actionLoading
          // }
          classes={{ root: classes.successIcon }}
          variant="round">
          <CheckIcon />
        </Button>
      </Dashboard>
    );
  }
}
