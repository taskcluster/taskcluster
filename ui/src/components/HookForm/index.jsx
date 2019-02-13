import React, { Component, Fragment } from 'react';
import { Link } from 'react-router-dom';
import { string, bool, func, oneOfType, object } from 'prop-types';
import classNames from 'classnames';
import { equals, assocPath } from 'ramda';
import cloneDeep from 'lodash.clonedeep';
import CodeEditor from '@mozilla-frontend-infra/components/CodeEditor';
import Code from '@mozilla-frontend-infra/components/Code';
import { withStyles } from '@material-ui/core/styles';
import List from '@material-ui/core/List';
import ListItem from '@material-ui/core/ListItem';
import ListItemText from '@material-ui/core/ListItemText';
import ListSubheader from '@material-ui/core/ListSubheader';
import TextField from '@material-ui/core/TextField';
import Switch from '@material-ui/core/Switch';
import FormGroup from '@material-ui/core/FormGroup';
import FormControlLabel from '@material-ui/core/FormControlLabel';
import Grid from '@material-ui/core/Grid';
import IconButton from '@material-ui/core/IconButton';
import Typography from '@material-ui/core/Typography';
import FlashIcon from 'mdi-react/FlashIcon';
import PlusIcon from 'mdi-react/PlusIcon';
import DeleteIcon from 'mdi-react/DeleteIcon';
import LinkIcon from 'mdi-react/LinkIcon';
import ContentSaveIcon from 'mdi-react/ContentSaveIcon';
import { docs } from 'taskcluster-lib-urls';
import Button from '../Button';
import SpeedDial from '../SpeedDial';
import SpeedDialAction from '../SpeedDialAction';
import DialogAction from '../DialogAction';
import DateDistance from '../DateDistance';
import { HOOKS_LAST_FIRE_TYPE } from '../../utils/constants';
import { hook } from '../../utils/prop-types';
import removeKeys from '../../utils/removeKeys';
import Snackbar from '../Snackbar';

const initialHook = {
  metadata: {
    name: '',
    description: '',
    owner: '',
    emailOnError: true,
  },
  schedule: [],
  task: {
    provisionerId: 'aws-provisioner-v1',
    workerType: 'tutorial',
    payload: {
      image: 'ubuntu:14.04',
      command: ['/bin/bash', '-c', 'echo "hello World"'],
      maxRunTime: 60 * 10,
    },
    metadata: {
      name: 'Hook Task',
      description: 'Task Description',
      owner: 'name@example.com',
      source: 'https://tools.taskcluster.net/hooks',
    },
    expires: { $fromNow: '3 months' },
    deadline: { $fromNow: '6 hours' },
  },
  triggerSchema: {
    type: 'object',
    properties: {},
    additionalProperties: false,
  },
};

@withStyles(theme => ({
  actionButtonSpan: {
    ...theme.mixins.fab,
    ...theme.mixins.actionButton,
  },
  saveHookSpan: {
    position: 'fixed',
    bottom: theme.spacing.double,
    right: theme.spacing.unit * 11,
  },
  editorListItem: {
    paddingTop: 0,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'start',
    '&> :last-child': {
      marginTop: theme.spacing.unit,
    },
  },
  iconButton: {
    marginRight: -14,
    '& svg': {
      fill: theme.palette.text.primary,
    },
  },
  listItemButton: {
    ...theme.mixins.listItemButton,
  },
  successIcon: {
    ...theme.mixins.successIcon,
  },
  deleteIcon: {
    ...theme.mixins.errorIcon,
  },
  code: {
    maxHeight: '70vh',
    margin: 0,
  },
  codeEditor: {
    overflow: 'auto',
    maxHeight: '70vh',
  },
  scheduleEntry: {
    paddingTop: 0,
    paddingBottom: 0,
  },
  subheader: {
    fontSize: theme.typography.pxToRem(16),
  },
}))
/** A form to view/edit/create a hook */
export default class HookForm extends Component {
  static defaultProps = {
    isNewHook: false,
    hook: initialHook,
    onTriggerHook: null,
    onCreateHook: null,
    onUpdateHook: null,
    onDeleteHook: null,
    actionLoading: false,
    dialogError: null,
  };

  static propTypes = {
    /** A GraphQL hook response. Not needed when creating a new hook  */
    hook: hook.isRequired,
    /** Set to `true` when creating a new hook. */
    isNewHook: bool,
    /** Callback function fired when a hook is triggered. */
    onTriggerHook: func,
    /** Callback function fired when a hook is created. */
    onCreateHook: func,
    /** Callback function fired when a hook is updated. */
    onUpdateHook: func,
    /** Callback function fired when a hook is deleted. */
    onDeleteHook: func,
    /** If true, action buttons will be disabled. */
    actionLoading: bool,
    /** Error to display when an action dialog is open. */
    dialogError: oneOfType([string, object]),
    /**
     * Callback function fired when the DialogAction component throws an error.
     * */
    onDialogActionError: func,
  };

  state = {
    hook: null,
    // eslint-disable-next-line react/no-unused-state
    previousHook: null,
    taskInput: '',
    triggerSchemaInput: '',
    triggerContextInput: '',
    scheduleTextField: '',
    taskValidJson: true,
    triggerSchemaValidJson: true,
    validation: {},
  };

  static getDerivedStateFromProps(props, state) {
    if (equals(props.hook, state.previousHook)) {
      return null;
    }

    const hook = props.isNewHook ? initialHook : props.hook;

    return {
      hook: props.hook,
      previousHook: props.hook,
      taskInput: JSON.stringify(
        removeKeys(cloneDeep(hook.task), ['__typename']),
        null,
        2
      ),
      triggerSchemaInput: JSON.stringify(hook.triggerSchema, null, 2),
      triggerContextInput: JSON.stringify({}),
      scheduleTextField: '',
      taskValidJson: true,
      triggerSchemaValidJson: true,
      validation: {
        owner: {
          error: false,
          message: '',
        },
      },
    };
  }

  getHookDefinition = () => {
    const { hook } = this.state;
    const definition = {
      metadata: {
        name: hook.metadata.name,
        description: hook.metadata.description,
        owner: hook.metadata.owner,
        emailOnError: hook.metadata.emailOnError,
      },
      schedule: hook.schedule,
      task: hook.task,
      triggerSchema: hook.triggerSchema,
    };

    return removeKeys(definition, ['__typename']);
  };

  handleCreateHook = () => {
    const { onCreateHook } = this.props;
    const {
      hook: { hookId, hookGroupId },
    } = this.state;

    onCreateHook &&
      onCreateHook({
        hookId,
        hookGroupId,
        payload: this.getHookDefinition(),
      });
  };

  handleDeleteCronJob = ({ currentTarget: { name } }) => {
    const { hook } = this.state;

    this.setState({
      hook: assocPath(
        ['schedule'],
        hook.schedule.filter(cronJob => cronJob !== name),
        hook
      ),
    });
  };

  handleDeleteHook = () => {
    const { onDeleteHook } = this.props;
    const {
      hook: { hookId, hookGroupId },
    } = this.state;

    onDeleteHook &&
      onDeleteHook({
        hookId,
        hookGroupId,
      });
  };

  handleEmailOnErrorChange = () => {
    this.setState({
      hook: assocPath(
        ['metadata', 'emailOnError'],
        !this.state.hook.metadata.emailOnError,
        this.state.hook
      ),
    });
  };

  handleScheduleChange = ({ target: { name, value } }) => {
    this.setState({ [name]: value });
  };

  handleNewCronJob = () => {
    const { hook, scheduleTextField } = this.state;

    this.setState({
      scheduleTextField: '',
      hook: assocPath(
        ['schedule'],
        this.state.hook.schedule.concat(scheduleTextField),
        hook
      ),
    });
  };

  handleTaskChange = value => {
    const { hook } = this.state;

    try {
      this.setState({
        taskInput: value,
        hook: assocPath(['task'], JSON.parse(value), hook),
        taskValidJson: true,
      });
    } catch (err) {
      this.setState({
        taskInput: value,
        taskValidJson: false,
      });
    }
  };

  handleTriggerContextChange = triggerContextInput => {
    this.setState({ triggerContextInput });
  };

  handleTriggerHookSubmit = () => {
    const { onTriggerHook } = this.props;
    const {
      hook: { hookId, hookGroupId },
      triggerContextInput,
    } = this.state;

    return onTriggerHook({
      hookId,
      hookGroupId,
      payload: JSON.parse(triggerContextInput),
    });
  };

  handleTriggerSchemaChange = value => {
    try {
      this.setState({
        triggerSchemaInput: value,
        hook: assocPath(['triggerSchema'], JSON.parse(value), this.state.hook),
        triggerSchemaValidJson: true,
      });
    } catch (err) {
      this.setState({
        triggerSchemaValidJson: false,
        triggerSchemaInput: value,
      });
    }
  };

  handleUpdateHook = () => {
    const { onUpdateHook } = this.props;
    const {
      hook: { hookId, hookGroupId },
    } = this.state;

    onUpdateHook &&
      onUpdateHook({
        hookId,
        hookGroupId,
        payload: this.getHookDefinition(),
      });
  };

  validHook = () => {
    const {
      hook,
      taskValidJson,
      triggerSchemaValidJson,
      validation,
    } = this.state;

    return (
      hook.hookGroupId &&
      hook.hookId &&
      hook.metadata.name &&
      hook.metadata.owner &&
      !validation.owner.error &&
      taskValidJson &&
      triggerSchemaValidJson
    );
  };

  handleHookGroupIdChange = e =>
    this.setState({
      hook: assocPath(['hookGroupId'], e.target.value, this.state.hook),
    });

  handleHookIdChange = e =>
    this.setState({
      hook: assocPath(['hookId'], e.target.value, this.state.hook),
    });

  handleNameChange = e =>
    this.setState({
      hook: assocPath(['metadata', 'name'], e.target.value, this.state.hook),
    });

  handleOwnerChange = e => {
    this.setState({
      hook: assocPath(['metadata', 'owner'], e.target.value, this.state.hook),
      validation: {
        owner: {
          error: !e.currentTarget.validity.valid,
          message: e.currentTarget.validationMessage,
        },
      },
    });
  };

  handleDescriptionChange = e =>
    this.setState({
      hook: assocPath(
        ['metadata', 'description'],
        e.target.value,
        this.state.hook
      ),
    });

  render() {
    const {
      actionLoading,
      dialogOpen,
      dialogError,
      classes,
      isNewHook,
      onActionDialogClose,
      onDialogActionError,
      onDialogOpen,
    } = this.props;
    const {
      scheduleTextField,
      taskInput,
      triggerSchemaInput,
      triggerContextInput,
      hook,
      validation,
    } = this.state;
    const isHookDirty = !equals(hook, this.props.hook);
    /* eslint-disable-next-line no-underscore-dangle */
    const lastFireTypeName = !isNewHook && hook.status.lastFire.__typename;

    return (
      <Fragment>
        <List>
          {isNewHook && (
            <Fragment>
              <ListItem>
                <TextField
                  required
                  label="Hook Group ID"
                  name="hookGroupId"
                  onChange={this.handleHookGroupIdChange}
                  fullWidth
                  value={hook.hookGroupId}
                />
              </ListItem>
              <ListItem>
                <TextField
                  required
                  label="Hook ID"
                  name="hookId"
                  onChange={this.handleHookIdChange}
                  fullWidth
                  value={hook.hookId}
                />
              </ListItem>
            </Fragment>
          )}
          {!isNewHook && (
            <Fragment>
              <ListItem>
                <ListItemText
                  primary="Hook Group ID"
                  secondary={<code>{hook.hookGroupId}</code>}
                />
              </ListItem>
              <ListItem>
                <ListItemText
                  primary="Hook ID"
                  secondary={<code>{hook.hookId}</code>}
                />
              </ListItem>
            </Fragment>
          )}
          <ListItem>
            <TextField
              required
              label="Name"
              name="name"
              onChange={this.handleNameChange}
              fullWidth
              value={hook.metadata.name}
            />
          </ListItem>
          <ListItem>
            <TextField
              error={validation.owner.error}
              required
              label="Owner Email"
              name="owner"
              type="email"
              helperText={validation.owner.message}
              onChange={this.handleOwnerChange}
              fullWidth
              value={hook.metadata.owner}
            />
          </ListItem>
          <ListItem>
            <TextField
              label="Description"
              name="description"
              placeholder="Hook description (markdown)"
              onChange={this.handleDescriptionChange}
              fullWidth
              multiline
              rows={5}
              value={hook.metadata.description}
            />
          </ListItem>
          <ListItem>
            <FormGroup row>
              <FormControlLabel
                control={
                  <Switch
                    checked={hook.metadata.emailOnError}
                    onChange={this.handleEmailOnErrorChange}
                  />
                }
                label="Email on Error"
              />
            </FormGroup>
          </ListItem>
          {!isNewHook && (
            <Fragment>
              <ListItem>
                <ListItemText
                  primary="Last Fired"
                  secondary={
                    lastFireTypeName === HOOKS_LAST_FIRE_TYPE.NO_FIRE ? (
                      'n/a'
                    ) : (
                      <DateDistance from={hook.status.lastFire.time} />
                    )
                  }
                />
              </ListItem>
              {lastFireTypeName === HOOKS_LAST_FIRE_TYPE.SUCCESSFUL_FIRE ? (
                <ListItem
                  button
                  component={Link}
                  className={classes.listItemButton}
                  to={`/tasks/${hook.status.lastFire.taskId}`}>
                  <ListItemText
                    primary="Last Fired Result"
                    secondary={hook.status.lastFire.taskId}
                  />
                  <LinkIcon />
                </ListItem>
              ) : (
                <ListItem>
                  <ListItemText
                    primary="Last Fired Result"
                    secondary={
                      lastFireTypeName === HOOKS_LAST_FIRE_TYPE.NO_FIRE ? (
                        'n/a'
                      ) : (
                        <pre>
                          {JSON.stringify(hook.status.lastFire.error, null, 2)}
                        </pre>
                      )
                    }
                  />
                </ListItem>
              )}
              <ListItem>
                <ListItemText
                  primary="Next Scheduled Fire"
                  secondary={
                    hook.status.nextScheduledDate ? (
                      <DateDistance from={hook.status.nextScheduledDate} />
                    ) : (
                      'n/a'
                    )
                  }
                />
              </ListItem>
            </Fragment>
          )}
          <List>
            <ListItem>
              <ListItemText
                primary={
                  <TextField
                    helperText={
                      <span>
                        See{' '}
                        <a
                          href="https://www.npmjs.com/package/cron-parser"
                          target="_blank"
                          rel="noopener noreferrer">
                          cron-parser
                        </a>{' '}
                        for format information. Times are in UTC.
                      </span>
                    }
                    label="Schedule"
                    name="scheduleTextField"
                    placeholder="* * * * * *"
                    fullWidth
                    onChange={this.handleScheduleChange}
                    value={scheduleTextField}
                  />
                }
              />
              <IconButton
                className={classes.iconButton}
                onClick={this.handleNewCronJob}>
                <PlusIcon />
              </IconButton>
            </ListItem>
            {hook.schedule.map(cronJob => (
              <ListItem className={classes.scheduleEntry} key={cronJob}>
                <ListItemText primary={<code>{cronJob}</code>} />
                <IconButton
                  className={classes.iconButton}
                  name={cronJob}
                  onClick={this.handleDeleteCronJob}>
                  <DeleteIcon />
                </IconButton>
              </ListItem>
            ))}
          </List>
          <List
            subheader={
              <ListSubheader className={classes.subheader}>
                Task Template *
              </ListSubheader>
            }>
            <ListItem className={classes.editorListItem}>
              <Typography variant="caption">
                <span>
                  When the hook fires, this template is rendered with{' '}
                  <a
                    href="https://taskcluster.github.io/json-e/"
                    target="_blank"
                    rel="noopener noreferrer">
                    JSON-e
                  </a>{' '}
                  to create the the task definition. See{' '}
                  {
                    <a
                      target="_blank"
                      rel="noopener noreferrer"
                      href={docs(
                        process.env.TASKCLUSTER_ROOT_URL,
                        'reference/core/taskcluster-hooks/docs/firing-hooks'
                      )}>
                      {'"'}
                      firing hooks
                      {'"'}
                    </a>
                  }{' '}
                  for more information.
                </span>
              </Typography>
              <CodeEditor
                lint
                value={taskInput}
                onChange={this.handleTaskChange}
              />
            </ListItem>
          </List>
          <List
            subheader={
              <ListSubheader className={classes.subheader}>
                Trigger Schema *
              </ListSubheader>
            }>
            <ListItem className={classes.editorListItem}>
              <Typography variant="caption">
                The payload to <code>triggerHook</code> must match this schema.
              </Typography>
              <CodeEditor
                value={triggerSchemaInput}
                lint
                onChange={this.handleTriggerSchemaChange}
              />
            </ListItem>
          </List>
        </List>
        {isNewHook ? (
          <Button
            spanProps={{ className: classes.actionButtonSpan }}
            tooltipProps={{ title: 'Save Hook' }}
            requiresAuth
            classes={{ root: classes.successIcon }}
            variant="round"
            disabled={!this.validHook() || actionLoading || !isHookDirty}
            onClick={this.handleCreateHook}>
            <ContentSaveIcon />
          </Button>
        ) : (
          <Fragment>
            <Button
              spanProps={{
                className: classNames(
                  classes.actionButtonSpan,
                  classes.saveHookSpan
                ),
              }}
              tooltipProps={{ title: 'Save Hook' }}
              requiresAuth
              classes={{ root: classes.successIcon }}
              variant="round"
              disabled={!this.validHook() || actionLoading || !isHookDirty}
              onClick={this.handleUpdateHook}>
              <ContentSaveIcon />
            </Button>
            <Snackbar open={!isHookDirty} message="Your data has been saved" />
            <SpeedDial>
              <SpeedDialAction
                requiresAuth
                tooltipOpen
                icon={<DeleteIcon />}
                onClick={this.handleDeleteHook}
                className={classes.deleteIcon}
                ButtonProps={{
                  disabled: actionLoading,
                }}
                tooltipTitle="Delete Hook"
              />
              <SpeedDialAction
                requiresAuth
                tooltipOpen
                icon={<FlashIcon />}
                onClick={onDialogOpen}
                className={classes.successIcon}
                ButtonProps={{
                  disabled: !this.validHook() || actionLoading,
                }}
                tooltipTitle="Trigger Hook"
              />
            </SpeedDial>
          </Fragment>
        )}
        {dialogOpen && (
          <DialogAction
            fullScreen
            open={dialogOpen}
            onSubmit={this.handleTriggerHookSubmit}
            onComplete={onActionDialogClose}
            onClose={onActionDialogClose}
            onError={onDialogActionError}
            error={dialogError}
            confirmText="Trigger Hook"
            body={
              <Fragment>
                <Typography gutterBottom>
                  Trigger Hook{' '}
                  <code>
                    {hook.hookGroupId}/{hook.hookId}
                  </code>{' '}
                  with the following context:
                </Typography>
                <Grid container spacing={16}>
                  <Grid item lg={6} md={6} sm={12}>
                    <Typography gutterBottom variant="subtitle1">
                      Context
                    </Typography>
                    <CodeEditor
                      lint
                      className={classes.codeEditor}
                      value={triggerContextInput}
                      onChange={this.handleTriggerContextChange}
                    />
                  </Grid>
                  <Grid item lg={6} md={6} sm={12}>
                    <Typography gutterBottom variant="subtitle1">
                      Schema
                    </Typography>
                    <Code language="json" className={classes.code}>
                      {JSON.stringify(hook.triggerSchema, null, 2)}
                    </Code>
                  </Grid>
                </Grid>
              </Fragment>
            }
          />
        )}
      </Fragment>
    );
  }
}
