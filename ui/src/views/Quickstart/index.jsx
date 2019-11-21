import { hot } from 'react-hot-loader';
import React, { Component, Fragment } from 'react';
import { withApollo } from 'react-apollo';
import CodeEditor from '@mozilla-frontend-infra/components/CodeEditor';
import Spinner from '@mozilla-frontend-infra/components/Spinner';
import { withStyles } from '@material-ui/core/styles';
import List from '@material-ui/core/List';
import ListItem from '@material-ui/core/ListItem';
import ListItemText from '@material-ui/core/ListItemText';
import MenuItem from '@material-ui/core/MenuItem';
import TextField from '@material-ui/core/TextField';
import Typography from '@material-ui/core/Typography';
import Checkbox from '@material-ui/core/Checkbox';
import FormLabel from '@material-ui/core/FormLabel';
import FormControl from '@material-ui/core/FormControl';
import FormGroup from '@material-ui/core/FormGroup';
import FormControlLabel from '@material-ui/core/FormControlLabel';
import AlertCircleOutlineIcon from 'mdi-react/AlertCircleOutlineIcon';
import CheckIcon from 'mdi-react/CheckIcon';
import RestartIcon from 'mdi-react/RestartIcon';
import { safeDump } from 'js-yaml';
import debounce from 'lodash.debounce';
import Dashboard from '../../components/Dashboard';
import Button from '../../components/Button';
import HelpView from '../../components/HelpView';
import urls from '../../utils/urls';
import ErrorPanel from '../../components/ErrorPanel';
import githubQuery from './github.graphql';

const taskDefinition = {
  version: 1,
  policy: {
    pullRequests: 'collaborators',
  },
  tasks: {
    $match: {
      taskId: { $eval: 'as_slugid("pr_task")' },
      provisionerId: 'proj-getting-started',
      workerType: 'tutorial',
      payload: {
        maxRunTime: 3600,
        image: 'node',
        command: [],
      },
      metadata: {
        name: '',
        description: '',
        owner: '${event.sender.login}@users.noreply.github.com', // eslint-disable-line no-template-curly-in-string
        source: '${event.repository.url}', // eslint-disable-line no-template-curly-in-string
      },
    },
  },
};
const baseCmd = [
  'git clone {{event.head.repo.url}} repo',
  'cd repo',
  'git config advice.detachedHead false',
  'git checkout {{event.head.sha}}',
];
const getMatchCondition = events => {
  let condition = '';
  const eventsJoin = Array.from(events).join(' ');

  if (eventsJoin.includes('pull_request')) {
    condition = `${condition}(tasks_for == "github-pull-request" && event["action"] in [${[
      ...events,
    ].sort()}])`;
  }

  if (eventsJoin.includes('push')) {
    if (condition.length > 0) {
      condition = `${condition} || `;
    }

    condition = `${condition}(tasks_for == "github-push")`;
  }

  if (eventsJoin.includes('release')) {
    if (condition.length > 0) {
      condition = `${condition} || `;
    }

    condition = `${condition}(tasks_for == "github-release")`;
  }

  return condition;
};

const getTaskDefinition = state => {
  const {
    access,
    commands,
    condition,
    image,
    taskName,
    taskDescription,
  } = state;

  return safeDump({
    ...taskDefinition,
    policy: {
      pullRequests: access,
    },
    tasks: {
      $match: {
        [condition]: {
          ...taskDefinition.tasks.$match,
          ...{
            metadata: {
              ...taskDefinition.tasks.$match.metadata,
              name: taskName,
              description: taskDescription,
            },
            payload: {
              ...taskDefinition.tasks.$match.payload,
              image,
              command: commands,
            },
          },
        },
      },
    },
  });
};

const cmdDirectory = (type, org = '<YOUR_ORG>', repo = '<YOUR_REPO>') =>
  ({
    node: [
      '/bin/bash',
      '--login',
      '-c',
      baseCmd.concat(['npm install .', 'npm test']).join(' && '),
    ],
    python: [
      '/bin/bash',
      '--login',
      '-c',
      baseCmd.concat(['pip install tox', 'tox']).join(' && '),
    ],
    'rust:latest': [
      '/bin/bash',
      '-c',
      baseCmd.concat(['rustc --test unit_test.rs', './unit_test']).join(' && '),
    ],
    golang: [
      '/bin/bash',
      '--login',
      '-c',
      [
        `mkdir -p /go/src/github.com/${org}/${repo}`,
        `cd /go/src/github.com/${org}/${repo}`,
        'git init',
        'git fetch {{ event.head.repo.url }} {{ event.head.ref }}',
        'git config advice.detachedHead false',
        'git checkout {{ event.head.sha }}',
        'go install',
        'go test ./...',
      ].join(' && '),
    ],
  }[type]);

@hot(module)
@withApollo
@withStyles(theme => ({
  separator: {
    padding: theme.spacing(2),
    paddingBottom: 0,
  },
  editorListItem: {
    paddingTop: 0,
  },
  checkIcon: {
    fill: theme.palette.success.main,
  },
  errorIcon: {
    fill: theme.palette.error.main,
  },
  resetButtonSpan: {
    ...theme.mixins.fab,
    ...theme.mixins.actionButton,
  },
  errorPanels: {
    marginTop: theme.spacing(2),
  },
  iconContainer: {
    marginLeft: theme.spacing(1),
    marginTop: theme.spacing(2),
    flexBasis: '10%',
    display: 'flex',
    justifyContent: 'center',
  },
  taskShouldRunFlex: {
    display: 'flex',
    width: '100%',
    [theme.breakpoints.down('xs')]: {
      flexDirection: 'column',
    },
  },
  mainHeading: {
    paddingLeft: theme.spacing(2),
  },
  descriptionTextField: {
    marginBottom: theme.spacing(4),
  },
  orgRepoStatus: {
    display: 'flex',
    alignItems: 'center',
    marginBottom: theme.spacing(4),
    paddingLeft: theme.spacing(2),
    paddingRight: theme.spacing(2),
  },
  orgRepoTextFields: {
    display: 'flex',
    flexBasis: '90%',
  },
}))
export default class QuickStart extends Component {
  initialEvents = new Set([
    'pull_request.opened',
    'pull_request.reopened',
    'pull_request.synchronize',
  ]);

  initialState = {
    events: this.initialEvents,
    condition: getMatchCondition(this.initialEvents),
    owner: '',
    repo: '',
    access: 'collaborators',
    image: 'node',
    commands: cmdDirectory('node'),
    commandSelection: 'standard',
    installedState: null,
    taskName: '',
    taskDescription: '',
  };

  state = this.initialState;

  getInstalledState = debounce(async (owner, repo) => {
    const { data } = await this.props.client.query({
      query: githubQuery,
      variables: {
        owner,
        repo,
      },
    });

    this.setState({
      installedState: data.githubRepository.installed ? 'success' : 'error',
    });
  }, 1000);

  handleEditorChange = editorValue => {
    this.setState({
      editorValue,
    });
  };

  handleCommandsChange = ({ target: { value } }) => {
    this.setState({
      commandSelection: value,
      commands: value === 'standard' ? cmdDirectory(this.state.image) : [],
      editorValue: null,
    });
  };

  handleEventsSelection = ({ target: { value } }) => {
    const events = new Set(this.state.events);

    events.has(value) ? events.delete(value) : events.add(value);

    // Note: this should be called after `events` has been modified
    // in the above line
    const condition = getMatchCondition(events);

    this.setState({
      events,
      condition,
      editorValue: null,
    });
  };

  handleInputChange = ({ target: { name, value } }) => {
    this.setState({ [name]: value, editorValue: null });
  };

  handleOrgRepoChange = ({ target: { name, value } }) => {
    this.setState({ [name]: value }, () => {
      const { owner, repo } = this.state;

      if (!owner || !repo) {
        return this.setState({ installedState: null });
      }

      this.setState({ installedState: 'loading' }, () => {
        this.getInstalledState(owner, repo);
      });
    });
  };

  handleReset = () => {
    const resetState = {
      ...this.initialState,
      condition: getMatchCondition(this.initialState.events),
    };

    this.setState({
      ...resetState,
      editorValue: getTaskDefinition(resetState),
    });
  };

  renderEditor() {
    const newYaml = getTaskDefinition(this.state);

    return (
      <CodeEditor
        onChange={this.handleEditorChange}
        mode="yaml"
        value={this.state.editorValue || newYaml}
      />
    );
  }

  render() {
    const { classes } = this.props;
    const {
      repo,
      owner,
      taskName,
      taskDescription,
      events,
      image,
      installedState,
      commandSelection,
      access,
    } = this.state;

    return (
      <Dashboard
        title="GitHub Quickstart"
        helpView={
          <HelpView
            description="Create a configuration file and
                plug the CI into your repository.">
            <Fragment>
              <Typography variant="body2" paragraph>
                This tool lets you easily generate a simple generic{' '}
                <code>.taskcluster.yml</code> file, which should live in the
                root of your repository. It defines tasks that you want{' '}
                {window.env.APPLICATION_NAME} to run for you. The tasks will run
                when certain GitHub events happen. You will choose the events
                you are interested in while creating the file.
              </Typography>
              <Typography variant="body2" paragraph>
                For independent developers and organization owners: How to set
                up your repository with {window.env.APPLICATION_NAME}
              </Typography>
              <ul>
                <li>
                  <Typography paragraph>
                    Fill out the form below. All changes in the form will
                    instantly show up in the code field.
                  </Typography>
                </li>
                <li>
                  <Typography paragraph>
                    When you are done editing, copy the contents of the code
                    field and paste it into a file named{' '}
                    <code>.taskcluster.yml</code> in the root of your
                    repository.
                  </Typography>
                </li>
                <li>
                  <Typography paragraph>
                    Make sure to install the{' '}
                    <a
                      href="https://github.com/apps/taskcluster"
                      target="_blank"
                      rel="noopener noreferrer">
                      Taskcluster-GitHub integration
                    </a>
                    .
                  </Typography>
                </li>
              </ul>
              <Typography variant="body2" paragraph>
                Optionally, after you create your file, you can edit it here or
                in you favorite editor to add more functionality. Please refer
                to the{' '}
                <a
                  href={urls.docs(
                    'reference/integrations/github/taskcluster-yml-v1'
                  )}
                  target="_blank"
                  rel="noopener noreferrer">
                  full documentation on our configuration files
                </a>
                .
              </Typography>
            </Fragment>
          </HelpView>
        }>
        <Fragment>
          <div className={classes.orgRepoStatus}>
            <div className={classes.orgRepoTextFields}>
              <TextField
                label="Org Name"
                name="owner"
                fullWidth
                onChange={this.handleOrgRepoChange}
                value={owner}
                autoFocus
              />
              <Typography className={classes.separator} variant="h5">
                /
              </Typography>
              <TextField
                label="Repo Name"
                name="repo"
                fullWidth
                onChange={this.handleOrgRepoChange}
                value={repo}
              />
            </div>
            <div className={classes.iconContainer}>
              {(installedState === 'success' && (
                <CheckIcon className={classes.checkIcon} />
              )) ||
                (installedState === 'error' && (
                  <AlertCircleOutlineIcon className={classes.errorIcon} />
                )) ||
                (installedState === 'loading' && <Spinner size={24} />)}
            </div>
          </div>

          {installedState === 'error' && (
            <ErrorPanel
              className={classes.errorPanels}
              error="The integration has not been set up for this repository. Please
              contact the organization owner to have it set up!"
            />
          )}
          <Typography className={classes.mainHeading} variant="h6">
            Create Your Task Definition
          </Typography>
          <List>
            <ListItem>
              <TextField
                label="Name"
                name="taskName"
                onChange={this.handleInputChange}
                fullWidth
                value={taskName}
              />
            </ListItem>
            <ListItem className={classes.descriptionTextField}>
              <TextField
                label="Description"
                name="taskDescription"
                onChange={this.handleInputChange}
                fullWidth
                multiline
                rows={3}
                value={taskDescription}
              />
            </ListItem>
            <ListItem>
              <FormControl component="fieldset">
                <FormLabel component="legend">
                  This task should run on
                </FormLabel>
                <div className={classes.taskShouldRunFlex}>
                  <FormGroup>
                    <FormControlLabel
                      control={
                        <Checkbox
                          checked={events.has('pull_request.opened')}
                          onChange={this.handleEventsSelection}
                          value="pull_request.opened"
                        />
                      }
                      label="Pull request opened"
                    />
                    <FormControlLabel
                      control={
                        <Checkbox
                          checked={events.has('pull_request.closed')}
                          onChange={this.handleEventsSelection}
                          value="pull_request.closed"
                        />
                      }
                      label="Pull request merged or closed"
                    />
                    <FormControlLabel
                      control={
                        <Checkbox
                          checked={events.has('pull_request.reopened')}
                          onChange={this.handleEventsSelection}
                          value="pull_request.reopened"
                        />
                      }
                      label="Pull request re-opened"
                    />
                  </FormGroup>
                  <FormGroup>
                    <FormControlLabel
                      control={
                        <Checkbox
                          checked={events.has('pull_request.synchronize')}
                          onChange={this.handleEventsSelection}
                          value="pull_request.synchronize"
                        />
                      }
                      label="New commit made in an opened pull request"
                    />
                    <FormControlLabel
                      control={
                        <Checkbox
                          checked={events.has('push')}
                          onChange={this.handleEventsSelection}
                          value="push"
                        />
                      }
                      label="Push"
                    />

                    <FormControlLabel
                      control={
                        <Checkbox
                          checked={events.has('release')}
                          onChange={this.handleEventsSelection}
                          value="release"
                        />
                      }
                      label="Release or tag created"
                    />
                  </FormGroup>
                </div>
              </FormControl>
            </ListItem>
            <ListItem>
              <TextField
                id="select-access"
                select
                label="Access"
                helperText="Who can trigger tasks from PRs?"
                value={access}
                name="access"
                onChange={this.handleInputChange}
                margin="normal">
                <MenuItem value="public">Public</MenuItem>
                <MenuItem value="collaborators">Collaborators</MenuItem>
              </TextField>
            </ListItem>
            <ListItem>
              <TextField
                id="select-language"
                select
                label="Project Language"
                helperText="This will select a corresponding docker image"
                value={image}
                name="image"
                onChange={this.handleInputChange}
                margin="normal">
                <MenuItem value="node">Node.js</MenuItem>
                <MenuItem value="python">Python</MenuItem>
                <MenuItem value="rust">Rust</MenuItem>
                <MenuItem value="go">Go</MenuItem>
              </TextField>
            </ListItem>
            <ListItem>
              <TextField
                id="select-commands"
                select
                label="Commands"
                value={commandSelection}
                onChange={this.handleCommandsChange}
                margin="normal">
                <MenuItem value="standard">
                  Clone repo and run my tests
                </MenuItem>
                <MenuItem value="custom">I will define them myself</MenuItem>
              </TextField>
            </ListItem>
            <ListItem>
              <ListItemText
                disableTypography
                primary={
                  <Typography variant="subtitle1">Task Definiton</Typography>
                }
              />
            </ListItem>
            <ListItem className={classes.editorListItem}>
              {this.renderEditor()}
            </ListItem>
          </List>
          <Button
            spanProps={{ className: classes.resetButtonSpan }}
            tooltipProps={{ title: 'Reset Form & File' }}
            variant="round"
            onClick={this.handleReset}
            color="secondary">
            <RestartIcon />
          </Button>
        </Fragment>
      </Dashboard>
    );
  }
}
