import React, { Component, Fragment } from 'react';
import { Link } from 'react-router-dom';
import { string, bool, func, oneOfType, object } from 'prop-types';
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
import RefreshIcon from 'mdi-react/RefreshIcon';
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
import ErrorPanel from '../ErrorPanel';
import withAlertOnClose from '../../utils/withAlertOnClose';

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

@withAlertOnClose
@withStyles(theme => ({
  actionButton: {
    ...theme.mixins.fab,
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
}))
/** A form to view/edit/create a hook */
export default class HookForm extends Component {
  static defaultProps = {
    isNewHook: false,
    hook: initialHook,
    onRefreshHookStatus: null,
    onTriggerHook: null,
    onCreateHook: null,
    onUpdateHook: null,
    onDeleteHook: null,
    actionLoading: false,
    error: null,
  };

  static getDerivedStateFromProps({ hook }, state) {
    if (state.hookId) {
      return null;
    }

    return {
      hookId: hook.hookId,
      hookGroupId: hook.hookGroupId,
      name: hook.metadata.name,
      owner: hook.metadata.owner,
      description: hook.metadata.description,
      emailOnError: hook.metadata.emailOnError,
      task: hook.task,
      taskInput: hook.task,
      triggerSchema: hook.triggerSchema,
      triggerSchemaInput: hook.triggerSchema,
      schedule: hook.schedule,
    };
  }

  static propTypes = {
    /** A GraphQL hook response. Not needed when creating a new hook  */
    hook,
    /** Set to `true` when creating a new hook. */
    isNewHook: bool,
    /** Callback function fired when a hook status is refreshed. */
    onRefreshHookStatus: func,
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
    /** Error to display. */
    error: oneOfType([string, object]),
  };

  state = {
    hookId: '',
    hookGroupId: '',
    name: '',
    owner: '',
    description: '',
    emailOnError: true,
    // eslint-disable-next-line react/no-unused-state
    task: null,
    taskInput: null,
    // eslint-disable-next-line react/no-unused-state
    triggerSchema: null,
    triggerContextInput: JSON.stringify({}),
    taskValidJson: true,
    triggerSchemaValidJson: true,
    scheduleTextField: '',
    schedule: null,
    dialogOpen: false,
  };

  getHookDefinition = () => {
    const {
      name,
      description,
      owner,
      emailOnError,
      schedule,
      task,
      triggerSchema,
    } = this.state;
    const definition = {
      metadata: {
        name,
        description,
        owner,
        emailOnError,
      },
      schedule,
      task,
      triggerSchema,
    };

    return removeKeys(definition, ['__typename']);
  };

  handleActionDialogClose = () => {
    this.setState({ dialogOpen: false });
  };

  handleCreateHook = () => {
    const { onCreateHook } = this.props;
    const { hookId, hookGroupId } = this.state;

    onCreateHook &&
      onCreateHook({
        hookId,
        hookGroupId,
        payload: this.getHookDefinition(),
      });
  };

  handleDeleteCronJob = ({ currentTarget: { name } }) => {
    this.setState({
      schedule: this.state.schedule.filter(cronJob => cronJob !== name),
    });
  };

  handleDeleteHook = () => {
    const { onDeleteHook } = this.props;
    const { hookId, hookGroupId } = this.state;

    onDeleteHook &&
      onDeleteHook({
        hookId,
        hookGroupId,
      });
  };

  handleEmailOnErrorChange = () => {
    this.setState({ emailOnError: !this.state.emailOnError });
  };

  handleInputChange = ({ target: { name, value } }) => {
    this.setState({ [name]: value });
  };

  handleNewCronJob = () => {
    const { scheduleTextField, schedule } = this.state;

    this.setState({
      scheduleTextField: '',
      schedule: schedule.concat(scheduleTextField),
    });
  };

  handleRefreshHookStatus = () => {
    const { onRefreshHookStatus } = this.props;

    if (onRefreshHookStatus) {
      onRefreshHookStatus();
    }
  };

  handleTaskChange = value => {
    try {
      this.setState({
        // eslint-disable-next-line react/no-unused-state
        task: JSON.parse(value),
        taskValidJson: true,
        taskInput: value,
      });
    } catch (err) {
      this.setState({
        taskValidJson: false,
        taskInput: value,
      });
    }
  };

  handleTriggerContextChange = triggerContextInput => {
    this.setState({ triggerContextInput });
  };

  handleTriggerHookClick = () => {
    this.setState({ dialogOpen: true });
  };

  handleTriggerHookSubmit = () => {
    const { onTriggerHook } = this.props;
    const { hookId, hookGroupId, triggerContextInput } = this.state;

    return onTriggerHook({
      hookId,
      hookGroupId,
      payload: JSON.parse(triggerContextInput),
    });
  };

  handleTriggerSchemaChange = value => {
    try {
      this.setState({
        // eslint-disable-next-line react/no-unused-state
        triggerSchema: JSON.parse(value),
        triggerSchemaValidJson: true,
        triggerSchemaInput: value,
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
    const { hookId, hookGroupId } = this.state;

    onUpdateHook &&
      onUpdateHook({
        hookId,
        hookGroupId,
        payload: this.getHookDefinition(),
      });
  };

  validHook = () => {
    const { name, owner, taskValidJson, triggerSchemaValidJson } = this.state;

    return name && owner && taskValidJson && triggerSchemaValidJson;
  };

  render() {
    const { actionLoading, error, hook, classes, isNewHook } = this.props;
    const {
      description,
      hookId,
      hookGroupId,
      owner,
      name,
      emailOnError,
      scheduleTextField,
      schedule,
      taskInput,
      triggerSchemaInput,
      triggerContextInput,
      dialogOpen,
    } = this.state;
    /* eslint-disable-next-line no-underscore-dangle */
    const lastFireTypeName = !isNewHook && hook.status.lastFire.__typename;

    return (
      <Fragment>
        {!dialogOpen && <ErrorPanel error={error} />}
        <List>
          {isNewHook && (
            <Fragment>
              <ListItem>
                <TextField
                  required
                  label="Hook Group ID"
                  name="hookGroupId"
                  onChange={this.handleInputChange}
                  fullWidth
                  value={hookGroupId}
                />
              </ListItem>
              <ListItem>
                <TextField
                  required
                  label="Hook ID"
                  name="hookId"
                  onChange={this.handleInputChange}
                  fullWidth
                  value={hookId}
                />
              </ListItem>
            </Fragment>
          )}
          {!isNewHook && (
            <Fragment>
              <ListItem>
                <ListItemText
                  primary="Hook Group ID"
                  secondary={<code>{hookGroupId}</code>}
                />
              </ListItem>
              <ListItem>
                <ListItemText
                  primary="Hook ID"
                  secondary={<code>{hookId}</code>}
                />
              </ListItem>
            </Fragment>
          )}
          <ListItem>
            <TextField
              required
              label="Name"
              name="name"
              onChange={this.handleInputChange}
              fullWidth
              value={name}
            />
          </ListItem>
          <ListItem>
            <TextField
              required
              label="Owner Email"
              name="owner"
              onChange={this.handleInputChange}
              fullWidth
              value={owner}
            />
          </ListItem>
          <ListItem>
            <TextField
              required
              label="Description"
              name="description"
              placeholder="Hook description (markdown)"
              onChange={this.handleInputChange}
              fullWidth
              multiline
              rows={5}
              value={description}
            />
          </ListItem>
          <ListItem>
            <FormGroup row>
              <FormControlLabel
                control={
                  <Switch
                    checked={emailOnError}
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
                <IconButton
                  onClick={this.handleRefreshHookStatus}
                  className={classes.iconButton}>
                  <RefreshIcon />
                </IconButton>
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
          <List subheader={<ListSubheader>Schedule</ListSubheader>}>
            <ListItem>
              <ListItemText
                primary={
                  <TextField
                    name="scheduleTextField"
                    placeholder="* * * * * *"
                    fullWidth
                    onChange={this.handleInputChange}
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
            {schedule.map(cronJob => (
              <ListItem key={cronJob}>
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
          <List subheader={<ListSubheader>Task Template *</ListSubheader>}>
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
                        `https://${process.env.TASKCLUSTER_ROOT_URL}`,
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
                options={{ mode: 'json' }}
                value={JSON.stringify(taskInput, null, 2)}
                onChange={this.handleTaskChange}
              />
            </ListItem>
          </List>
          <List subheader={<ListSubheader>Trigger Schema *</ListSubheader>}>
            <ListItem className={classes.editorListItem}>
              <Typography variant="caption">
                The payload to <code>triggerHook</code> must match this schema.
              </Typography>
              <CodeEditor
                options={{ mode: 'json' }}
                value={JSON.stringify(triggerSchemaInput, null, 2)}
                onChange={this.handleTriggerSchemaChange}
              />
            </ListItem>
          </List>
        </List>
        {isNewHook ? (
          <Button
            spanProps={{ className: classes.actionButton }}
            tooltipProps={{ title: 'Save Hook' }}
            requiresAuth
            classes={{ root: classes.successIcon }}
            variant="round"
            disabled={!this.validHook() || actionLoading}
            onClick={this.handleCreateHook}>
            <ContentSaveIcon />
          </Button>
        ) : (
          <SpeedDial>
            <SpeedDialAction
              requiresAuth
              tooltipOpen
              icon={<ContentSaveIcon />}
              onClick={this.handleUpdateHook}
              tooltipTitle="Save Hook"
              ButtonProps={{
                disabled: !this.validHook() || actionLoading,
              }}
            />
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
              onClick={this.handleTriggerHookClick}
              className={classes.successIcon}
              ButtonProps={{
                disabled: !this.validHook() || actionLoading,
              }}
              tooltipTitle="Trigger Hook"
            />
          </SpeedDial>
        )}
        {dialogOpen && (
          <DialogAction
            fullScreen
            open={dialogOpen}
            onSubmit={this.handleTriggerHookSubmit}
            onComplete={this.handleActionDialogClose}
            onClose={this.handleActionDialogClose}
            confirmText="Trigger Hook"
            body={
              <Fragment>
                {dialogOpen && <ErrorPanel error={error} />}
                <Typography gutterBottom>
                  Trigger Hook{' '}
                  <code>
                    {hookGroupId}/{hookId}
                  </code>{' '}
                  with the following context:
                </Typography>
                <Grid container spacing={16}>
                  <Grid item lg={6} md={6} sm={12}>
                    <Typography gutterBottom variant="subtitle1">
                      Context
                    </Typography>
                    <CodeEditor
                      className={classes.codeEditor}
                      options={{ mode: 'json' }}
                      lint
                      value={triggerContextInput}
                      onChange={this.handleTriggerContextChange}
                    />
                  </Grid>
                  <Grid item lg={6} md={6} sm={12}>
                    <Typography gutterBottom variant="subtitle1">
                      Schema
                    </Typography>
                    <Code language="json" className={classes.code}>
                      {JSON.stringify(triggerSchemaInput, null, 2)}
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
