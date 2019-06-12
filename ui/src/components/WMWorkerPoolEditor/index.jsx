import React, { Component, Fragment } from 'react';
import { withRouter } from 'react-router-dom';
import { func, bool, string } from 'prop-types';
import ListSubheader from '@material-ui/core/ListSubheader';
import ListItem from '@material-ui/core/ListItem';
import TextField from '@material-ui/core/TextField';
import Typography from '@material-ui/core/Typography/Typography';
import FormControlLabel from '@material-ui/core/FormControlLabel';
import Switch from '@material-ui/core/Switch';
import MenuItem from '@material-ui/core/MenuItem';
import { withStyles } from '@material-ui/core';
import ContentSaveIcon from 'mdi-react/ContentSaveIcon';
import DeleteIcon from 'mdi-react/DeleteIcon';
import CodeEditor from '@mozilla-frontend-infra/components/CodeEditor';
import List from '../../views/Documentation/components/List';
import Button from '../Button';
import isWorkerTypeNameValid from '../../utils/isWorkerTypeNameValid';
import { WorkerManagerWorkerPoolSummary } from '../../utils/prop-types';
import ErrorPanel from '../ErrorPanel';
import { joinWorkerPoolId } from '../../utils/workerPool';
import formatError from '../../utils/formatError';
import { PROVIDER_CONFIGS, PROVIDERS, GCP } from '../../utils/constants';
import SpeedDialAction from '../SpeedDialAction';
import SpeedDial from '../SpeedDial';

@withRouter
@withStyles(theme => ({
  saveIcon: {
    ...theme.mixins.successIcon,
  },
  deleteIcon: {
    ...theme.mixins.errorIcon,
  },
  createIconSpan: {
    ...theme.mixins.fab,
    ...theme.mixins.actionButton,
  },
  saveIconSpan: {
    position: 'fixed',
    bottom: theme.spacing.double,
    right: theme.spacing.unit * 11,
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
export default class WMWorkerPoolEditor extends Component {
  static defaultProps = {
    allowEditWorkerPoolId: false,
    providerType: GCP,
  };

  static propTypes = {
    workerPool: WorkerManagerWorkerPoolSummary.isRequired,
    saveRequest: func.isRequired,
    providerType: string.isRequired,
    allowEditWorkerPoolId: bool,
    deleteRequest: func,
  };

  state = {
    workerPool: {
      workerPoolId1: this.props.workerPool.workerPoolId1,
      workerPoolId2: this.props.workerPool.workerPoolId2,
      description: this.props.workerPool.description,
      owner: this.props.workerPool.owner,
      emailOnError: this.props.workerPool.emailOnError,
      config: this.props.workerPool.config,
    },
    providerType: this.props.providerType,
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

  handleProviderTypeChange = event => {
    const {
      target: { value },
    } = event;

    this.setState({
      providerType: value,
      workerPool: {
        ...this.state.workerPool,
        config: PROVIDER_CONFIGS.get(value),
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

  handleOnClick = async event => {
    const { workerPoolId1, workerPoolId2, ...payload } = this.state.workerPool;
    const { name: requestName } = event.currentTarget;

    payload.providerId = PROVIDERS.get(this.state.providerType);

    this.setState({ error: null, actionLoading: true });

    try {
      await this.props[requestName]({
        workerPoolId: joinWorkerPoolId(workerPoolId1, workerPoolId2),
        payload,
      });

      this.props.history.push('/worker-manager');
    } catch (error) {
      this.setState({ error: formatError(error), actionLoading: false });
    }
  };

  render() {
    const { classes, allowEditWorkerPoolId } = this.props;
    const {
      workerPool,
      providerType,
      invalidProviderConfig,
      error,
      actionLoading,
    } = this.state;

    return (
      <Fragment>
        <ErrorPanel fixed error={error} />
        <List className={classes.list}>
          <ListSubheader>Worker Pool ID *</ListSubheader>
          <ListItem>
            <TextField
              name="workerPoolId1"
              error={!isWorkerTypeNameValid(workerPool.workerPoolId1)}
              onChange={this.handleInputChange}
              fullWidth
              value={workerPool.workerPoolId1}
              required
              disabled={!allowEditWorkerPoolId}
              autoFocus={allowEditWorkerPoolId}
              helperText={
                !isWorkerTypeNameValid(workerPool.workerPoolId1) &&
                '1 to 38 alphanumeric characters'
              }
            />
            <Typography className={classes.separator} variant="h5">
              /
            </Typography>
            <TextField
              name="workerPoolId2"
              error={!isWorkerTypeNameValid(workerPool.workerPoolId2)}
              onChange={this.handleInputChange}
              fullWidth
              value={workerPool.workerPoolId2}
              required
              disabled={!allowEditWorkerPoolId}
              helperText={
                !isWorkerTypeNameValid(workerPool.workerPoolId2) &&
                '1 to 38 alphanumeric characters'
              }
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
              error={!workerPool.owner.includes('@')}
              onChange={this.handleInputChange}
              fullWidth
              value={workerPool.owner}
              margin="normal"
              required
              helperText={
                !workerPool.owner.includes('@') && 'Should be valid email'
              }
            />
          </ListItem>

          <ListItem>
            <FormControlLabel
              control={
                <Switch
                  checked={workerPool.emailOnError}
                  onChange={this.handleSwitchChange}
                  value="emailOnError"
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
              {Array.from(PROVIDERS.keys()).map(p => (
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
            spanProps={{
              className: allowEditWorkerPoolId
                ? classes.createIconSpan
                : classes.saveIconSpan,
            }}
            name="saveRequest"
            disabled={invalidProviderConfig || actionLoading}
            requiresAuth
            tooltipProps={{ title: 'Save Worker Pool' }}
            onClick={this.handleOnClick}
            classes={{ root: classes.saveIcon }}
            variant="round">
            <ContentSaveIcon />
          </Button>

          {!allowEditWorkerPoolId && (
            <SpeedDial>
              <SpeedDialAction
                name="deleteRequest"
                requiresAuth
                tooltipOpen
                icon={<DeleteIcon />}
                onClick={this.handleOnClick}
                tooltipTitle="Delete"
                className={classes.deleteIcon}
                disabled={actionLoading}
              />
            </SpeedDial>
          )}
        </List>
      </Fragment>
    );
  }
}
