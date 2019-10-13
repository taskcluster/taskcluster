import React, { Component, Fragment } from 'react';
import { withRouter } from 'react-router-dom';
import { oneOfType, object, string, func, bool } from 'prop-types';
import { equals } from 'ramda';
import ListSubheader from '@material-ui/core/ListSubheader';
import ListItem from '@material-ui/core/ListItem';
import TextField from '@material-ui/core/TextField';
import Typography from '@material-ui/core/Typography/Typography';
import MarkdownTextArea from '@mozilla-frontend-infra/components/MarkdownTextArea';
import MenuItem from '@material-ui/core/MenuItem';
import FormControlLabel from '@material-ui/core/FormControlLabel';
import Switch from '@material-ui/core/Switch';
import { withStyles } from '@material-ui/core';
import ContentSaveIcon from 'mdi-react/ContentSaveIcon';
import DeleteIcon from 'mdi-react/DeleteIcon';
import CodeEditor from '@mozilla-frontend-infra/components/CodeEditor';
import DialogAction from '../DialogAction';
import List from '../../views/Documentation/components/List';
import Button from '../Button';
import isWorkerTypeNameValid from '../../utils/isWorkerTypeNameValid';
import {
  WorkerManagerWorkerPoolSummary,
  providersArray,
} from '../../utils/prop-types';
import ErrorPanel from '../ErrorPanel';
import {
  joinWorkerPoolId,
  splitWorkerPoolId,
  isWorkerPoolIdSecondHalfValid,
} from '../../utils/workerPool';
import formatError from '../../utils/formatError';
import {
  NULL_WORKER_POOL,
  PROVIDER_DEFAULT_CONFIGS,
} from '../../utils/constants';
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
    ...theme.mixins.fab,
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
  workerPoolDescriptionListItem: {
    marginBottom: theme.spacing.quad,
  },
}))
export default class WMWorkerPoolEditor extends Component {
  static defaultProps = {
    isNewWorkerPool: false,
    workerPool: NULL_WORKER_POOL,
    dialogError: null,
    onDialogActionError: null,
    onDialogActionComplete: null,
    onDialogActionOpen: null,
    onDialogActionClose: null,
  };

  static propTypes = {
    workerPool: WorkerManagerWorkerPoolSummary.isRequired,
    providers: providersArray.isRequired,
    saveRequest: func.isRequired,
    isNewWorkerPool: bool,
    deleteRequest: func,
    /** Error to display when an action dialog is open. */
    dialogError: oneOfType([string, object]),
    /**
     * Callback function fired when the DialogAction component throws an error.
     * */
    onDialogActionError: func,
    /**
     * Callback function fired when the DialogAction component runs
     * */
    onDialogActionComplete: func,
    /**
     * Callback function fired when the dialog should open.
     */
    onDialogActionOpen: func,
    /**
     * Callback function fired when the dialog should close.
     */
    onDialogActionClose: func,
  };

  state = {
    workerPool: {
      workerPoolId1: splitWorkerPoolId(this.props.workerPool.workerPoolId)
        .provisionerId,
      workerPoolId2: splitWorkerPoolId(this.props.workerPool.workerPoolId)
        .workerType,
      providerId: this.props.workerPool.providerId,
      description: this.props.workerPool.description,
      owner: this.props.workerPool.owner,
      emailOnError: this.props.workerPool.emailOnError,
      config: this.props.workerPool.config,
    },
    invalidProviderConfig: false,
    actionLoading: false,
    error: null,
    validation: {
      workerPoolId1: {
        error: null,
        message: null,
      },
      workerPoolId2: {
        error: null,
        message: null,
      },
      owner: {
        error: null,
        message: null,
      },
    },
  };

  handleInputChange = ({
    currentTarget: { name, value, validity, validationMessage },
  }) => {
    const newState = {
      workerPool: { ...this.state.workerPool, [name]: value },
    };

    if (name === 'owner') {
      Object.assign(newState, {
        validation: {
          ...this.state.validation,
          owner: {
            error: !validity.valid,
            message: validationMessage,
          },
        },
      });
    }

    if (name === 'workerPoolId1' || name === 'workerPoolId2') {
      const isValid =
        name === 'workerPoolId1'
          ? isWorkerTypeNameValid(value)
          : isWorkerPoolIdSecondHalfValid(value);

      Object.assign(newState, {
        validation: {
          ...this.state.validation,
          [name]: {
            error: !isValid,
            message: !isValid ? '1 to 38 alphanumeric characters' : null,
          },
        },
      });
    }

    this.setState(newState);
  };

  isValid() {
    const {
      workerPool: { providerId },
      validation,
    } = this.state;

    return (
      !this.state.invalidProviderConfig &&
      !Object.values(validation).some(({ error }) => Boolean(error)) &&
      providerId !== ''
    );
  }

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

  handleProviderChange = event => {
    const {
      target: { value: providerId },
    } = event;
    const { providers } = this.props;
    const {
      workerPool: { config: oldConfig },
    } = this.state;
    const providerInfo = providers.find(i => i.providerId === providerId);

    if (!providerInfo) {
      return;
    }

    // update config to default for this providerType only if not already set
    const config = equals(oldConfig, {})
      ? PROVIDER_DEFAULT_CONFIGS.get(providerInfo.providerType)
      : oldConfig;

    this.setState({
      workerPool: {
        ...this.state.workerPool,
        config,
        providerId: providerInfo.providerId,
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

  handleDeleteWorkerPool = () => {
    const { workerPoolId1, workerPoolId2, ...payload } = this.state.workerPool;

    return this.props.deleteRequest({
      workerPoolId: joinWorkerPoolId(workerPoolId1, workerPoolId2),
      payload,
    });
  };

  render() {
    const {
      classes,
      isNewWorkerPool,
      providers,
      dialogOpen,
      dialogError,
      onDialogActionClose,
      onDialogActionError,
      onDialogActionOpen,
      onDialogActionComplete,
    } = this.props;
    const { workerPool, error, actionLoading, validation } = this.state;
    const options = {
      extraKeys: {
        Tab: false,
      },
    };

    return (
      <Fragment>
        <ErrorPanel fixed error={error} />
        <List className={classes.list}>
          <ListSubheader>Worker Pool ID *</ListSubheader>
          <ListItem>
            <TextField
              name="workerPoolId1"
              error={validation.workerPoolId1.error}
              onChange={this.handleInputChange}
              fullWidth
              value={workerPool.workerPoolId1}
              required
              disabled={!isNewWorkerPool}
              autoFocus={isNewWorkerPool}
              helperText={validation.workerPoolId1.message}
            />
            <Typography className={classes.separator} variant="h5">
              /
            </Typography>
            <TextField
              name="workerPoolId2"
              error={validation.workerPoolId2.error}
              onChange={this.handleInputChange}
              fullWidth
              value={workerPool.workerPoolId2}
              required
              disabled={!isNewWorkerPool}
              helperText={validation.workerPoolId2.message}
            />
          </ListItem>
        </List>

        <List className={classes.list}>
          <ListItem className={classes.workerPoolDescriptionListItem}>
            <MarkdownTextArea
              name="description"
              placeholder="Worker pool description (markdown)"
              onChange={this.handleInputChange}
              value={workerPool.description}
              defaultTabIndex={isNewWorkerPool ? 0 : 1}
            />
          </ListItem>

          <ListItem>
            <TextField
              label="Owner's Email"
              name="owner"
              error={validation.owner.error}
              onChange={this.handleInputChange}
              fullWidth
              value={workerPool.owner}
              margin="normal"
              required
              type="email"
              helperText={validation.owner.message}
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
              select
              required
              id="select-provider-type"
              className={classes.dropdown}
              helperText="Which cloud do you want to run your tasks in?"
              value={workerPool.providerId}
              onChange={this.handleProviderChange}>
              {providers.map(({ providerId }) => (
                <MenuItem key={providerId} value={providerId}>
                  {providerId}
                </MenuItem>
              ))}
            </TextField>
          </ListItem>
        </List>

        <List className={classes.list}>
          <ListSubheader>Configuration</ListSubheader>
          <ListItem>
            <CodeEditor
              value={JSON.stringify(workerPool.config, null, 2)}
              onChange={this.handleEditorChange}
              lint
              options={options}
            />
          </ListItem>

          <Button
            spanProps={{
              className: isNewWorkerPool
                ? classes.createIconSpan
                : classes.saveIconSpan,
            }}
            name="saveRequest"
            disabled={!this.isValid()}
            requiresAuth
            tooltipProps={{ title: 'Save Worker Pool' }}
            onClick={this.handleOnClick}
            classes={{ root: classes.saveIcon }}
            variant="round">
            <ContentSaveIcon />
          </Button>

          {!isNewWorkerPool && (
            <SpeedDial>
              <SpeedDialAction
                requiresAuth
                tooltipOpen
                icon={<DeleteIcon />}
                onClick={onDialogActionOpen}
                tooltipTitle="Delete"
                className={classes.deleteIcon}
                disabled={actionLoading}
              />
            </SpeedDial>
          )}
          {dialogOpen && (
            <DialogAction
              open={dialogOpen}
              onSubmit={this.handleDeleteWorkerPool}
              onComplete={onDialogActionComplete}
              onClose={onDialogActionClose}
              onError={onDialogActionError}
              error={dialogError}
              title="Delete Worker Pool?"
              body={
                <Typography>
                  This will delete the worker pool{' '}
                  {joinWorkerPoolId(
                    workerPool.workerPoolId1,
                    workerPool.workerPoolId2
                  )}
                  .
                </Typography>
              }
              confirmText="Delete Worker Pool"
            />
          )}
        </List>
      </Fragment>
    );
  }
}
