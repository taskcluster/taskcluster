import { Component, Fragment } from 'react';
import { Link } from 'react-router-dom';
import { bool, func } from 'prop-types';
import CodeEditor from '@mozilla-frontend-infra/components/CodeEditor';
import { withStyles } from '@material-ui/core/styles';
import List from '@material-ui/core/List';
import ListItem from '@material-ui/core/ListItem';
import ListItemText from '@material-ui/core/ListItemText';
import ListSubheader from '@material-ui/core/ListSubheader';
import TextField from '@material-ui/core/TextField';
import Switch from '@material-ui/core/Switch';
import FormGroup from '@material-ui/core/FormGroup';
import FormControlLabel from '@material-ui/core/FormControlLabel';
import Tooltip from '@material-ui/core/Tooltip';
import Button from '@material-ui/core/Button';
import IconButton from '@material-ui/core/IconButton';
import Typography from '@material-ui/core/Typography';
import SpeedDialAction from '@material-ui/lab/SpeedDialAction';
import FlashIcon from 'mdi-react/FlashIcon';
import PlusIcon from 'mdi-react/PlusIcon';
import DeleteIcon from 'mdi-react/DeleteIcon';
import LinkIcon from 'mdi-react/LinkIcon';
import RefreshIcon from 'mdi-react/RefreshIcon';
import ContentSaveIcon from 'mdi-react/ContentSaveIcon';
import { docs } from 'taskcluster-lib-urls';
import SpeedDial from '../../components/SpeedDial';
import DateDistance from '../../components/DateDistance';
import { HOOKS_LAST_FIRE_TYPE } from '../../utils/constants';
import { hook } from '../../utils/prop-types';

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
  saveIcon: {
    ...theme.mixins.successIcon,
  },
}))
/** A form to view/edit/create a hook */
export default class HookForm extends Component {
  static propTypes = {
    /** A GraphQL hook response. Not needed when creating a new hook  */
    hook,
    /** Set to `true` when creating a new hook. */
    isNewHook: bool,
    /** Callback function fired when a hook status is refreshed. */
    onRefreshHookStatus: func,
  };

  static defaultProps = {
    isNewHook: false,
    hook: initialHook,
    onRefreshHookStatus: null,
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
    taskValidJson: true,
    triggerSchemaValidJson: true,
    scheduleTextField: '',
    schedule: null,
  };

  static getDerivedStateFromProps({ hook }, prevState) {
    if (prevState.hookId) {
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

  handleInputChange = ({ target: { name, value } }) => {
    this.setState({ [name]: value });
  };

  // TODO: Handle trigger hook
  handleTriggerHook = () => {
    // const hook = this.state.triggerSchema;
  };

  // TODO: Handle save hook
  handleSaveHook = () => {
    // const hook = this.state.hook;
  };

  handleEmailOnErrorChange = () => {
    this.setState({ emailOnError: !this.state.emailOnError });
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

  handleRefreshHookStatus = () => {
    const { onRefreshHookStatus } = this.props;

    if (onRefreshHookStatus) {
      onRefreshHookStatus();
    }
  };

  validHook = () => {
    const {
      name,
      description,
      owner,
      taskValidJson,
      triggerSchemaValidJson,
    } = this.state;

    return (
      name && description && owner && taskValidJson && triggerSchemaValidJson
    );
  };

  handleNewCronJob = () => {
    const { scheduleTextField, schedule } = this.state;

    this.setState({
      scheduleTextField: '',
      schedule: schedule.concat(scheduleTextField),
    });
  };

  handleDeleteCronJob = ({ currentTarget: { name } }) => {
    this.setState({
      schedule: this.state.schedule.filter(cronJob => cronJob !== name),
    });
  };

  render() {
    const { hook, classes, isNewHook } = this.props;
    const {
      description,
      hookId,
      hookGroupId,
      owner,
      emailOnError,
      scheduleTextField,
      schedule,
      taskInput,
      triggerSchemaInput,
    } = this.state;
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
              label="Owner"
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
                      {'"'}firing hooks{'"'}
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
          <Tooltip title="Save Hook">
            <div className={classes.actionButton}>
              <Button
                color="secondary"
                variant="fab"
                disabled={!this.validHook()}
                onClick={this.handleSaveHook}>
                <ContentSaveIcon />
              </Button>
            </div>
          </Tooltip>
        ) : (
          <SpeedDial>
            <SpeedDialAction
              icon={<ContentSaveIcon className={classes.saveIcon} />}
              onClick={this.handleSaveHook}
              classes={{ button: classes.saveIcon }}
              tooltipTitle="Save Hook"
              ButtonProps={{
                disabled: !this.validHook(),
              }}
            />
            <SpeedDialAction
              icon={<FlashIcon />}
              onClick={this.handleTriggerHook}
              ButtonProps={{ color: 'secondary' }}
              tooltipTitle="Trigger Hook"
            />
          </SpeedDial>
        )}
      </Fragment>
    );
  }
}
