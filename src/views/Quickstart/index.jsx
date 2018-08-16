import { hot } from 'react-hot-loader';
import { Component, Fragment } from 'react';
import { withApollo } from 'react-apollo';
import CodeEditor from '@mozilla-frontend-infra/components/CodeEditor';
import ErrorPanel from '@mozilla-frontend-infra/components/ErrorPanel';
import Spinner from '@mozilla-frontend-infra/components/Spinner';
import { withStyles } from '@material-ui/core/styles';
import List from '@material-ui/core/List';
import ListItem from '@material-ui/core/ListItem';
import ListSubheader from '@material-ui/core/ListSubheader';
import MenuItem from '@material-ui/core/MenuItem';
import Tooltip from '@material-ui/core/Tooltip';
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
import githubQuery from './github.graphql';

const initialYaml = {
  version: 0,
  tasks: [
    {
      provisionerId: '{{ taskcluster.docker.provisionerId }}',
      workerType: '{{ taskcluster.docker.workerType }}',
      extra: {
        github: {
          env: true,
          events: [],
        },
      },
      payload: {
        maxRunTime: 3600,
        image: 'node',
        command: [],
      },
      metadata: {
        name: '',
        description: '',
        owner: '{{ event.head.user.email }}',
        source: '{{ event.head.repo.url }}',
      },
    },
  ],
};
const baseCmd = [
  'git clone {{event.head.repo.url}} repo',
  'cd repo',
  'git config advice.detachedHead false',
  'git checkout {{event.head.sha}}',
];
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
  orgRepo: {
    display: 'flex',
    alignItems: 'center',
    ...theme.mixins.gutters(),
  },
  separator: {
    padding: theme.spacing.double,
    paddingBottom: 0,
  },
  checkIcon: {
    fill: theme.palette.success.main,
  },
  errorIcon: {
    fill: theme.palette.error.main,
  },
  resetButton: {
    ...theme.mixins.fab,
  },
  errorPanels: {
    marginTop: theme.spacing.double,
  },
  iconContainer: {
    marginLeft: theme.spacing.unit,
  },
}))
export default class QuickStart extends Component {
  static initialState = {
    events: new Set([
      'pull_request.opened',
      'pull_request.reopened',
      'pull_request.synchronize',
    ]),
    taskName: '',
    taskDescription: '',
  };

  state = {
    ...QuickStart.initialState,
    owner: '',
    repo: '',
    access: 'collaborators',
    image: 'node',
    commands: cmdDirectory('node'),
    commandSelection: 'standard',
    installedState: null,
  };

  handleEventsSelection = ({ target: { value } }) => {
    const events = new Set(this.state.events);

    events.has(value) ? events.delete(value) : events.add(value);

    this.setState({
      events,
      editorValue: null,
    });
  };

  handleInputChange = ({ target: { name, value } }) => {
    this.setState({ [name]: value, editorValue: null });
  };

  handleCommandsChange = ({ target: { value } }) => {
    this.setState({
      commandSelection: value,
      commands: value === 'standard' ? cmdDirectory(this.state.image) : [],
      editorValue: null,
    });
  };

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

  handleEditorChange = editorValue => {
    this.setState({
      editorValue,
    });
  };

  renderEditor() {
    const newYaml = safeDump({
      ...initialYaml,
      access: this.state.access,
      tasks: [
        {
          ...initialYaml.tasks[0],
          ...{
            metadata: {
              ...initialYaml.tasks[0].metadata,
              name: this.state.taskName,
              description: this.state.taskDescription,
            },
            extra: {
              github: {
                events: [...this.state.events].sort(),
              },
            },
            payload: {
              ...initialYaml.tasks[0].payload,
              command: this.state.commands,
              image: this.state.image,
            },
          },
        },
      ],
    });

    return (
      <CodeEditor
        onChange={this.handleEditorChange}
        mode="yaml"
        value={this.state.editorValue || newYaml}
      />
    );
  }

  handleReset = () => {
    this.setState(QuickStart.initialState);
  };

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
      <Dashboard title="GitHub Quick Start">
        <Fragment>
          <div className={classes.orgRepo}>
            <TextField
              label="Organization Name"
              name="owner"
              onChange={this.handleOrgRepoChange}
              value={owner}
            />
            <Typography className={classes.separator} variant="headline">
              /
            </Typography>
            <TextField
              label="Repository Name"
              name="repo"
              onChange={this.handleOrgRepoChange}
              value={repo}
            />
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
          <List>
            <ListSubheader>Task Definiton Helper</ListSubheader>
            <ListItem>
              <TextField
                label="Name"
                name="taskName"
                onChange={this.handleInputChange}
                fullWidth
                value={taskName}
              />
            </ListItem>
            <ListItem>
              <TextField
                label="Description"
                name="taskDescription"
                onChange={this.handleInputChange}
                fullWidth
                multiline
                rows={4}
                value={taskDescription}
              />
            </ListItem>
            <ListItem>
              <FormControl component="fieldset">
                <FormLabel component="legend">
                  This task should run on
                </FormLabel>
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
                        checked={events.has('pull_request.reopened')}
                        onChange={this.handleEventsSelection}
                        value="pull_request.reopened"
                      />
                    }
                    label="Pull request re-opened"
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
                </FormGroup>
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
            <ListSubheader>Task Definiton</ListSubheader>
            <ListItem>{this.renderEditor()}</ListItem>
          </List>
          <Tooltip title="Reset Form & File">
            <Button
              variant="fab"
              onClick={this.handleReset}
              color="secondary"
              className={classes.resetButton}>
              <RestartIcon />
            </Button>
          </Tooltip>
        </Fragment>
      </Dashboard>
    );
  }
}
