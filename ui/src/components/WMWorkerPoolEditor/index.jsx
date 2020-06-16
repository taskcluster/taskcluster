import React, { Component, Fragment } from 'react';
import { withRouter } from 'react-router-dom';
import { oneOfType, object, string, func, bool } from 'prop-types';
import List from '@material-ui/core/List';
import ListSubheader from '@material-ui/core/ListSubheader';
import ListItem from '@material-ui/core/ListItem';
import ListItemText from '@material-ui/core/ListItemText';
import Chip from '@material-ui/core/Chip';
import Avatar from '@material-ui/core/Avatar';
import Typography from '@material-ui/core/Typography';
import MenuItem from '@material-ui/core/MenuItem';
import WorkerIcon from 'mdi-react/WorkerIcon';
import MessageAlertIcon from 'mdi-react/MessageAlertIcon';
import FormControlLabel from '@material-ui/core/FormControlLabel';
import FormGroup from '@material-ui/core/FormGroup';
import Paper from '@material-ui/core/Paper';
import Switch from '@material-ui/core/Switch';
import { withStyles } from '@material-ui/core';
import ContentSaveIcon from 'mdi-react/ContentSaveIcon';
import DeleteIcon from 'mdi-react/DeleteIcon';
import CodeEditor from '@mozilla-frontend-infra/components/CodeEditor';
import TextField from '../TextField';
import MarkdownTextArea from '../MarkdownTextArea';
import DialogAction from '../DialogAction';
import Button from '../Button';
import isWorkerTypeNameValid from '../../utils/isWorkerTypeNameValid';
import Link from '../../utils/Link';
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
  deleteTooltipLabel: {
    backgroundColor: theme.mixins.errorIcon.backgroundColor,
  },
  createIconSpan: {
    ...theme.mixins.fab,
    ...theme.mixins.actionButton,
  },
  saveIconSpan: {
    ...theme.mixins.fab,
    bottom: theme.spacing(2),
    right: theme.spacing(11),
    ...theme.mixins.actionButton,
  },
  dropdown: {
    minWidth: 200,
  },
  separator: {
    padding: theme.spacing(2),
    paddingBottom: 0,
  },
  workerPoolDescriptionListItem: {
    marginTop: theme.spacing(1),
    marginBottom: theme.spacing(3),
  },
  ownerEmailListItem: {
    display: 'block',
  },
  metadata: {
    marginRight: theme.spacing(1),
  },
  overviewList: {
    padding: theme.spacing(2),
    paddingBottom: theme.spacing(1),
    margin: `0 0 ${theme.spacing(1)}px 0`,
    display: 'flex',
    flexWrap: 'wrap',
    listStyle: 'none',
    '& li': {
      marginBottom: theme.spacing(1),
    },
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
      config: JSON.stringify(this.props.workerPool.config || {}, null, 2),
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
      workerPool: { providerId, workerPoolId1, workerPoolId2, owner },
      validation,
    } = this.state;

    return (
      !this.state.invalidProviderConfig &&
      !Object.values(validation).some(({ error }) => Boolean(error)) &&
      workerPoolId1 &&
      workerPoolId2 &&
      providerId &&
      owner
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
    const providerInfo = providers.find(i => i.providerId === providerId);

    if (!providerInfo) {
      return;
    }

    this.setState({
      workerPool: {
        ...this.state.workerPool,
        config: JSON.stringify(
          PROVIDER_DEFAULT_CONFIGS.get(providerInfo.providerType) || {},
          null,
          2
        ),
        providerId: providerInfo.providerId,
      },
    });
  };

  handleEditorChange = value => {
    const { workerPool } = this.state;

    try {
      JSON.parse(value);

      this.setState({
        workerPool: {
          ...workerPool,
          config: value,
        },
        invalidProviderConfig: false,
      });
    } catch (err) {
      this.setState({
        workerPool: {
          ...workerPool,
          config: value,
        },
        invalidProviderConfig: true,
      });
    }
  };

  handleOnClick = async event => {
    const { workerPoolId1, workerPoolId2, ...rest } = this.state.workerPool;
    const { name: requestName } = event.currentTarget;

    this.setState({ error: null, actionLoading: true });

    try {
      const payload = { ...rest, config: JSON.parse(rest.config) };

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
    const { workerPoolId1, workerPoolId2 } = this.state.workerPool;

    return this.props.deleteRequest({
      workerPoolId: joinWorkerPoolId(workerPoolId1, workerPoolId2),
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
    const {
      description,
      emailOnError,
      owner,
      providerId,
      workerPoolId,
      config,
      currentCapacity,
      pendingTasks,
    } = this.props.workerPool;
    const isWorkerPoolDirty =
      isNewWorkerPool ||
      workerPool.description !== description ||
      workerPool.emailOnError !== emailOnError ||
      workerPool.owner !== owner ||
      workerPool.providerId !== providerId ||
      workerPool.config !== JSON.stringify(config || {}, null, 2) ||
      joinWorkerPoolId(workerPool.workerPoolId1, workerPool.workerPoolId2) !==
        workerPoolId;
    const { provisionerId, workerType } = splitWorkerPoolId(workerPoolId);

    return (
      <Fragment>
        <ErrorPanel fixed error={error} />
        {!isNewWorkerPool && (
          <Paper component="ul" className={classes.overviewList}>
            <li>
              <Chip
                variant="outlined"
                size="small"
                className={classes.metadata}
                avatar={<Avatar>{currentCapacity || 0}</Avatar>}
                label="Current Capacity"
              />
            </li>
            <li>
              <Chip
                variant="outlined"
                size="small"
                className={classes.metadata}
                avatar={<Avatar>{pendingTasks || 0}</Avatar>}
                label="Pending Tasks"
              />
            </li>
            <li>
              <Chip
                size="small"
                className={classes.metadata}
                icon={<WorkerIcon />}
                label="Workers (Queue View)"
                component={Link}
                clickable
                to={`/provisioners/${encodeURIComponent(
                  provisionerId
                )}/worker-types/${encodeURIComponent(workerType)}`}
              />
            </li>
            <li>
              <Chip
                size="small"
                className={classes.metadata}
                icon={<MessageAlertIcon />}
                label="Worker Pool Errors"
                component={Link}
                clickable
                to={`/worker-manager/${encodeURIComponent(
                  workerPoolId
                )}/errors`}
              />
            </li>
          </Paper>
        )}
        <List>
          <div>
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
          </div>
          <ListItem className={classes.workerPoolDescriptionListItem}>
            <MarkdownTextArea
              name="description"
              placeholder="Worker pool description (markdown)"
              onChange={this.handleInputChange}
              value={workerPool.description}
              defaultTabIndex={isNewWorkerPool ? 0 : 1}
            />
          </ListItem>
          <ListItem className={classes.ownerEmailListItem}>
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
            <FormGroup row>
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
            </FormGroup>
          </ListItem>
          <ListItem>
            <ListItemText
              disableTypography
              primary={<Typography variant="subtitle1">Provider</Typography>}
              secondary={
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
              }
            />
          </ListItem>

          <ListItem>
            <ListItemText
              disableTypography
              primary={
                <Typography variant="subtitle1" gutterBottom>
                  Configuration
                </Typography>
              }
              secondary={
                <CodeEditor
                  value={workerPool.config}
                  onChange={this.handleEditorChange}
                  lint
                />
              }
            />
          </ListItem>
        </List>

        <Button
          spanProps={{
            className: isNewWorkerPool
              ? classes.createIconSpan
              : classes.saveIconSpan,
          }}
          name="saveRequest"
          disabled={!this.isValid() || !isWorkerPoolDirty}
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
              classes={{
                icon: classes.deleteIcon,
                staticTooltipLabel: classes.deleteTooltipLabel,
              }}
              FabProps={{ disabled: actionLoading }}
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
              <Typography variant="body2">
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
      </Fragment>
    );
  }
}
