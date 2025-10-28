import React, { Component, Fragment } from 'react';
import { withRouter } from 'react-router-dom';
import { oneOfType, object, string, func, bool } from 'prop-types';
import {
  ButtonBase,
  Switch,
  withStyles,
  Paper,
  FormGroup,
  FormControlLabel,
  MenuItem,
  Typography,
  ListItemText,
  ListItem,
  ListSubheader,
  List,
} from '@material-ui/core';
import ClockOutlineIcon from 'mdi-react/ClockOutlineIcon';
import RunIcon from 'mdi-react/RunIcon';
import TimerSandIcon from 'mdi-react/TimerSandIcon';
import CloseIcon from 'mdi-react/CloseIcon';
import green from '@material-ui/core/colors/green';
import purple from '@material-ui/core/colors/purple';
import red from '@material-ui/core/colors/red';
import { titleCase } from 'title-case';
import classNames from 'classnames';
import MessageAlertIcon from 'mdi-react/MessageAlertIcon';
import ContentSaveIcon from 'mdi-react/ContentSaveIcon';
import DeleteIcon from 'mdi-react/DeleteIcon';
import CodeEditor from '../CodeEditor';
import TextField from '../TextField';
import MarkdownTextArea from '../MarkdownTextArea';
import DialogAction from '../DialogAction';
import Button from '../Button';
import isWorkerTypeNameValid from '../../utils/isWorkerTypeNameValid';
import {
  WorkerManagerWorkerPoolSummary,
  WorkerManagerWorkerPoolErrorStats,
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
  THEME,
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
  overviewList: {
    alignItems: 'center',
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
  statusButton: {
    display: 'flex',
    flexGrow: 1,
    flexBasis: 0,
    padding: theme.spacing(1),
    justifyContent: 'space-around',
    cursor: 'pointer',
    margin: theme.spacing(1),
    '& > div': {
      display: 'flex',
      flexDirection: 'column',
      width: '100%',
    },
    borderRadius: theme.spacing(0.25),
  },
  statusButtonTypography: {
    color: THEME.PRIMARY_TEXT_DARK,
  },
  statusTitle: {
    textAlign: 'right',
  },
  statusIcon: {
    fill: THEME.PRIMARY_TEXT_DARK,
  },
  runningCapacity: {
    backgroundColor: theme.palette.success.dark,
    '&:hover': {
      backgroundColor: green[900],
    },
  },
  stoppingCapacity: {
    backgroundColor: theme.palette.grey[600],
    '&:hover': {
      backgroundColor: theme.palette.grey[800],
    },
  },
  pendingTasks: {
    backgroundColor: theme.palette.grey[600],
    '&:hover': {
      backgroundColor: theme.palette.grey[800],
    },
  },
  requestedCapacity: {
    backgroundColor: purple[400],
    '&:hover': {
      backgroundColor: purple[600],
    },
  },
  errorsTile: {
    backgroundColor: red[400],
    '&:hover': {
      backgroundColor: red[600],
    },
  },
}))
export default class WMWorkerPoolEditor extends Component {
  static defaultProps = {
    isNewWorkerPool: false,
    workerPool: NULL_WORKER_POOL,
    errorStats: null,
    dialogError: null,
    onDialogActionError: null,
    onDialogActionComplete: null,
    onDialogActionOpen: null,
    onDialogActionClose: null,
  };

  static propTypes = {
    workerPool: WorkerManagerWorkerPoolSummary.isRequired,
    errorStats: WorkerManagerWorkerPoolErrorStats,
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
    originalSerializedWorkerPool: this.props.isNewWorkerPool
      ? null
      : this.serializeWorkerPool(this.props.workerPool),
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

  serializeWorkerPool(wp) {
    let workerPoolId1;
    let workerPoolId2;

    if (wp.workerPoolId) {
      const split = splitWorkerPoolId(wp.workerPoolId);

      workerPoolId1 = split.provisionerId;
      workerPoolId2 = split.workerType;
    } else {
      workerPoolId1 = wp.workerPoolId1;
      workerPoolId2 = wp.workerPoolId2;
    }

    const config =
      typeof wp.config === 'string'
        ? wp.config
        : JSON.stringify(wp.config || {}, null, 2);

    return JSON.stringify({
      workerPoolId1,
      workerPoolId2,
      providerId: wp.providerId,
      description: wp.description,
      owner: wp.owner,
      emailOnError: wp.emailOnError,
      config,
    });
  }

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
      this.setState({
        originalSerializedWorkerPool: this.serializeWorkerPool(
          this.state.workerPool
        ),
        actionLoading: false,
      });
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
      errorStats,
    } = this.props;
    const { workerPool, error, actionLoading, validation } = this.state;
    const {
      workerPoolId,
      requestedCapacity,
      runningCapacity,
      stoppingCapacity,
      pendingTasks,
    } = this.props.workerPool;
    const currentSerializedWorkerPool = this.serializeWorkerPool(
      this.state.workerPool
    );
    const isWorkerPoolDirty =
      this.state.originalSerializedWorkerPool !== currentSerializedWorkerPool;
    const { provisionerId, workerType } = splitWorkerPoolId(workerPoolId);
    const workerTypeUrl = `/provisioners/${provisionerId}/worker-types/${workerType}`;
    const workerPoolUrl = `/worker-manager/${encodeURIComponent(workerPoolId)}`;
    const workerPoolStats = [
      {
        label: 'Pending Tasks',
        value: pendingTasks,
        className: 'pendingTasks',
        Icon: ClockOutlineIcon,
        href: `${workerTypeUrl}/pending-tasks`,
      },
      {
        label: 'Requested Capacity',
        value: requestedCapacity,
        className: 'requestedCapacity',
        Icon: TimerSandIcon,
        href: `${workerPoolUrl}/workers?state=requested`,
      },
      {
        label: 'Running Capacity',
        value: runningCapacity,
        className: 'runningCapacity',
        Icon: RunIcon,
        href: `${workerTypeUrl}?filterBy=running`,
      },
      {
        label: 'Stopping Capacity',
        value: stoppingCapacity,
        className: 'stoppingCapacity',
        Icon: CloseIcon,
        href: `${workerPoolUrl}/workers?state=stopping`,
      },
      {
        label: 'Errors',
        value: errorStats?.totals?.total,
        className: 'errorsTile',
        Icon: MessageAlertIcon,
        href: `${workerPoolUrl}/errors`,
      },
    ];

    return (
      <Fragment>
        <ErrorPanel fixed error={error} />
        {!isNewWorkerPool && (
          <Fragment>
            <Paper component="ul" className={classes.overviewList}>
              {workerPoolStats.map(
                ({ label, value, className, Icon, href }) => {
                  return (
                    <ButtonBase
                      focusRipple
                      key={className}
                      name={className}
                      variant="contained"
                      href={href}
                      className={classNames(
                        classes[className],
                        classes.statusButton
                      )}>
                      <div>
                        <Icon
                          color="white"
                          className={classes.statusIcon}
                          size={32}
                        />
                      </div>
                      <div>
                        <Typography
                          align="right"
                          className={classes.statusButtonTypography}
                          variant="h4">
                          {value || 0}
                        </Typography>
                        <Typography
                          className={classNames(
                            classes.statusTitle,
                            classes.statusButtonTypography
                          )}
                          variant="caption">
                          {titleCase(label)}
                        </Typography>
                      </div>
                    </ButtonBase>
                  );
                }
              )}
            </Paper>
          </Fragment>
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
