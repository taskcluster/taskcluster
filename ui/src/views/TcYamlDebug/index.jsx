import React, { Component, Fragment } from 'react';
import { withApollo } from 'react-apollo';
import { withStyles } from '@material-ui/core/styles';
import List from '@material-ui/core/List';
import ListItem from '@material-ui/core/ListItem';
import ListItemText from '@material-ui/core/ListItemText';
import Typography from '@material-ui/core/Typography';
import { dump, load } from 'js-yaml';
import debounce from 'lodash.debounce';
import { Grid, MenuItem } from '@material-ui/core';
import TextField from '../../components/TextField';
import CodeEditor from '../../components/CodeEditor';
import Dashboard from '../../components/Dashboard';
import Button from '../../components/Button';
import { siteSpecificVariable } from '../../utils/siteSpecific';
import ajv from '../../utils/ajv';
import scrollToHash from '../../utils/scrollToHash';
import githubQuery from './github.graphql';
import JsonDisplay from '../../components/JsonDisplay';

const prefetchSchema = async () => {
  await ajv.loadServiceSchema('common', 'metaschema.json');
  await Promise.all([
    ajv.loadServiceSchema(
      'github',
      'v1/taskcluster-github-config.json',
      'github-v0'
    ),
    ajv.loadServiceSchema(
      'github',
      'v1/taskcluster-github-config.v1.json',
      'github-v1'
    ),
    ajv.loadServiceSchema('queue', 'v1/task-metadata.json'),
    ajv.loadServiceSchema('queue', 'v1/task.json'),
    ajv.loadServiceSchema(
      'queue',
      'v1/create-task-request.json',
      'create-task'
    ),
  ]);
};

prefetchSchema();

const releaseActions = [
  'published',
  'unpublished',
  'created',
  'edited',
  'deleted',
  'prereleased',
  'released',
];
const pullRequestActions = [
  'opened',
  'synchronize',
  'reopened',
  'assigned',
  'auto_merge_disabled',
  'auto_merge_enabled',
  'closed',
  'converted_to_draft',
  'dequeued',
  'edited',
  'enqueued',
  'labeled',
  'ready_for_review',
  'review_requested',
  'review_request_removed',
  'unassigned',
  'unlabeled',
];
const isValidYamlUrl = url => {
  const urlRe = /(.*)\/\.taskcluster.yml$/;

  try {
    const parsed = new URL(url);
    const allowedHosts = ['raw.githubusercontent.com'];

    return (
      allowedHosts.includes(parsed.hostname) && urlRe.test(parsed.pathname)
    );
  } catch (e) {
    return false;
  }
};

// we embed JSON-e here, which looks a lot like a template to eslint..
/* eslint-disable no-template-curly-in-string */

const getTaskDefinition = state => {
  const { commands, image, taskName, taskDescription } = state;
  const taskQueueId =
    siteSpecificVariable('tutorial_worker_pool_id') ||
    'proj-getting-started/tutorial';

  return dump({
    version: 1,
    reporting: 'checks-v1',
    policy: {
      pullRequests: 'public',
    },
    tasks: {
      $let: {
        head_rev: {
          $switch: {
            'tasks_for == "github-pull-request"':
              '${event.pull_request.head.sha}',
            'tasks_for == "github-push"': '${event.after}',
            $default: 'UNKNOWN',
          },
        },
        repository: {
          $if: 'tasks_for == "github-pull-request"',
          then: '${event.pull_request.head.repo.html_url}',
          else: '${event.repository.html_url}',
        },
      },
      in: {
        $match: {
          'tasks_for == "github-pull-request" && event["action"] in ["opened", "synchronize"]': {
            taskId: { $eval: 'as_slugid("test")' },
            deadline: { $fromNow: '1 day' },
            taskQueueId,
            metadata: {
              name: taskName,
              description: taskDescription,
              owner: '${event.sender.login}@users.noreply.github.com',
              source: '${event.repository.url}',
            },
            payload: {
              maxRunTime: 3600,
              image,
              command: commands,
            },
          },
        },
      },
    },
  });
};

const getCustomContext = () => {
  return dump({
    timestamp: Math.floor(new Date()),
  });
};

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
  mainHeading: {
    paddingLeft: theme.spacing(2),
  },
  codeEditor: {
    height: 480,
  },
  contextEditor: {
    height: 100,
  },
  dropdown: {
    minWidth: 200,
  },
  findingsRow: {
    fontSize: 14,
    margin: 0,
    padding: theme.spacing(0.5),
    paddingLeft: theme.spacing(1),
    paddingRight: theme.spacing(1),
    borderBottom: `1px solid ${theme.palette.divider}`,
    verticalAlign: 'top',
  },
  code: {
    maxWidth: 700,
    fontFamily: 'monospace',
    fontSize: 12,
    border: '1px solid #eee',
    padding: theme.spacing(1),
    whiteSpace: 'pre-wrap',
    wordBreak: 'break-all',
  },
  scopes: {
    fontSize: 12,
  },
  tasks: {
    '& pre': {
      fontSize: 12,
    },
  },
  textField: {
    width: '60%',
  },
}))
export default class TcYamlDebug extends Component {
  constructor(props) {
    super(props);

    const search = new URLSearchParams(this.props.location.search);

    this.state = {
      findings: [],
      taskclusterYmlUrl: search.get('url', ''),
      isValidUrl: true,
      validationMessage: '',
      urlChanged: false,
      editorValue: getTaskDefinition({}),
      extraContext: getCustomContext(),
      parsed: false,
      parserOk: false,
      parserVersion: '',
      parserChecks: false,
      parserAutoCancel: false,
    };
  }

  componentDidMount() {
    this.loadTaskclusterYml();
  }

  handleEditorChange = editorValue => {
    this.setState({
      editorValue,
    });
    this.analyzeLazy();
  };

  handleExtraContextChange = extraContext => {
    this.setState({
      extraContext,
    });
    this.analyzeLazy();
  };

  handleTaskclusterYmlUrlChange = e => {
    this.setState({
      taskclusterYmlUrl: e.target.value,
    });
    this.validateUrlDebounced();
  };

  validateUrlDebounced = debounce(() => this.validateUrl(), 1000);

  validateUrl() {
    const { history } = this.props;
    const { taskclusterYmlUrl } = this.state;
    const isValidUrl = isValidYamlUrl(taskclusterYmlUrl);

    this.setState({
      isValidUrl,
      validationMessage: isValidUrl
        ? ''
        : 'Invalid URL: should be https://raw.githubusercontent/**/.taskcluster.yml file in a GitHub repository',
    });

    if (taskclusterYmlUrl && isValidUrl) {
      history.push({
        search: `?url=${encodeURIComponent(taskclusterYmlUrl)}`,
        hash: '#findings',
      });
      this.loadTaskclusterYml();
    }
  }

  analyzeLazy = debounce(() => this.handleAnalyze(), 1000);

  async loadTaskclusterYml() {
    const { taskclusterYmlUrl } = this.state;

    if (!isValidYamlUrl(taskclusterYmlUrl)) {
      return;
    }

    try {
      const data = await (await fetch(taskclusterYmlUrl)).text();

      this.setState({
        editorValue: data,
        urlChanged: true,
      });
      this.analyzeLazy();
    } catch (e) {
      this.setState({
        editorValue: `# Error loading ${taskclusterYmlUrl}: ${e.message}`,
      });
    }
  }

  handleCustomEventSimulate = e => {
    const [tasksFor, action] = e.target.value.split('.');

    this.runEvent(tasksFor, action, {
      expectedZeroTasks: false,
      prepend: true,
    });
  };

  resetFindings() {
    const emptyFindings = [];

    this.setState({
      findings: emptyFindings,
      parsed: false,
      parserOk: false,
      parserVersion: '',
      parserChecks: false,
      parserAutoCancel: false,
    });
  }

  addFinding(item, prepend = false) {
    this.setState(state => {
      const idx = state.findings.length + 1;

      return {
        findings: prepend
          ? [{ ...item, idx }, ...state.findings]
          : [...state.findings, { ...item, idx }],
      };
    });
  }

  handleAnalyze = () => {
    this.resetFindings();

    let doc;
    let schema = 'github-v1';

    try {
      doc = load(this.state.editorValue);
      this.setState({
        parsed: true,
      });
    } catch (e) {
      this.setState({
        parsed: true,
      });
    }

    if (!doc) {
      return;
    }

    this.setState({
      parserVersion: doc.version,
    });

    if (doc.version !== 1) {
      schema = 'github-v0';
    }

    const validation = ajv.validate(schema, doc);

    if (validation) {
      this.setState({
        parserOk: true,
      });
    } else {
      this.setState({
        parserOk: false,
      });
      ajv.errors.forEach((error, i) => {
        this.addFinding({
          type: `schema-${i}`,
          sentiment: '⚠️',
          message: `${error.instancePath} ${error.message} ${JSON.stringify(
            error.params
          )}`,
        });
      });
    }

    if (doc?.reporting !== 'checks-v1') {
      this.setState({
        parserChecks: false,
      });
    } else {
      this.setState({
        parserChecks: true,
      });
    }

    this.setState({
      parserAutoCancel: doc?.autoCancelPreviousChecks === true,
    });

    if (!doc?.tasks) {
      this.addFinding({
        type: 'tasks',
        sentiment: '⛔️',
        message: 'No tasks defined!',
      });
    }

    this.runEvent('github-push');
    this.runEvent('github-push', undefined, {
      overrides: { ref: 'refs/tags/v1.0.2' },
    });
    this.runEvent('github-release', 'published');
    this.runEvent('github-pull-request-untrusted', 'opened');
    this.runEvent('github-pull-request', 'opened');
    this.runEvent('github-pull-request', 'assigned', {
      expectedZeroTasks: true,
    });

    if (this.state.urlChanged && this.state.findings.length > 1) {
      setTimeout(() => scrollToHash(), 100);
    }

    this.setState({ urlChanged: false });
  };

  async runEvent(tasksFor, action, options) {
    const opts = {
      overrides: {},
      expectedZeroTasks: false,
      prepend: false,
      ...options,
    };

    try {
      const extraContext = load(this.state.extraContext);
      const {
        data: { renderTaskclusterYml: parsed },
      } = await this.props.client.query({
        query: githubQuery,
        variables: {
          payload: {
            body: this.state.editorValue,
            organization: 'taskcluster',
            repository: 'taskcluster',
            fakeEvent: {
              type: tasksFor,
              action,
              overrides: {
                branch: extraContext?.branch ?? 'main',
                ...extraContext,
                ...opts.overrides,
              },
            },
          },
        },
      });
      const tasks = Array.isArray(parsed?.tasks)
        ? parsed.tasks.map(item => item.task)
        : Object.values(parsed.tasks).map(({ task }) => task);
      const tasksCount = tasks?.length || 0;
      const suspicious = opts.expectedZeroTasks && tasksCount > 0;

      this.addFinding(
        {
          type: `${tasksFor}${action ? `.${action}` : ''}`,
          sentiment: suspicious ? '⛔️' : '✅',
          message:
            tasksCount === 0
              ? ''
              : `${tasksCount} task(s) defined ${
                  suspicious ? ', but normally should be 0' : ''
                }`,
          tasksCount,
          tasks: parsed?.tasks,
          scopes: parsed?.scopes,
          validation: this.validateTasks(tasks),
        },
        opts.prepend
      );
    } catch (e) {
      this.addFinding(
        {
          type: `${tasksFor}${action ? `.${action}` : ''}`,
          sentiment: '⛔️',
          message: [
            e.message,
            e.location ? e.location.join('.') : '',
            e.lineNumber ? `line: ${e.lineNumber}` : '',
            e.columnNumber ? `column: ${e.columnNumber}` : '',
          ].join(' '),
        },
        opts.prepend
      );
    }
  }

  validateTasks(tasks) {
    const errors = [];

    tasks.forEach((task, i) => {
      const validation = ajv.validate('create-task', task);

      if (!validation) {
        ajv.errors.forEach(error => {
          errors.push(
            `Task #${i}: ${error.instancePath} ${
              error.message
            } ${JSON.stringify(error.params)}`
          );
        });
      }
    });

    return errors;
  }

  renderFindings() {
    const { findings } = this.state;
    const { classes } = this.props;

    if (!findings.length) {
      return;
    }

    return (
      <Grid container spacing={2} id="findings">
        {findings.map(
          ({
            type,
            sentiment,
            message,
            tasks,
            scopes,
            idx,
            tasksCount,
            validation,
          }) => (
            <Grid container key={idx} className={classes.findingsRow}>
              <Grid item xs={12} sm={4}>
                <ListItemText
                  primary={
                    <Typography>
                      {sentiment} {type}
                    </Typography>
                  }
                  secondary={message}
                />
                {scopes?.length ? (
                  <React.Fragment>
                    <JsonDisplay
                      wrapperClassName={classes.scopes}
                      syntax="yaml"
                      objectContent={{ scopes }}
                    />
                  </React.Fragment>
                ) : (
                  ''
                )}
              </Grid>
              <Grid item xs={12} sm={8} className={classes.tasks}>
                {tasksCount ? (
                  <JsonDisplay syntax="yaml" objectContent={{ tasks }} />
                ) : (
                  ''
                )}
                {tasksCount === 0 && scopes ? 'No tasks defined' : ''}
                {validation?.length ? (
                  <ul>
                    {validation.map(error => (
                      <li key={error}>⚠️ {error}</li>
                    ))}
                  </ul>
                ) : (
                  ''
                )}
              </Grid>
            </Grid>
          )
        )}
      </Grid>
    );
  }

  render() {
    const { classes } = this.props;
    const {
      taskclusterYmlUrl,
      isValidUrl,
      validationMessage,
      parsed,
      parserOk,
      parserVersion,
      parserChecks,
      parserAutoCancel,
    } = this.state;

    return (
      <Dashboard title="GitHub .taskcluster.yml debug" disableTitleFormatting>
        <Fragment>
          <Typography className={classes.mainHeading} variant="h6">
            Lint your <code>.taskcluster.yml</code>
          </Typography>
          <List>
            <ListItem>
              <ListItemText
                disableTypography
                primary={
                  <Typography variant="subtitle1">
                    Your .taskcluster.yml
                  </Typography>
                }
              />
              <TextField
                label="Link to .taskcluster.yml"
                name="taskclusterYmlUrl"
                onChange={this.handleTaskclusterYmlUrlChange}
                value={taskclusterYmlUrl || ''}
                className={classes.textField}
                error={taskclusterYmlUrl !== '' && !isValidUrl}
                helperText={validationMessage}
              />
            </ListItem>
            <ListItem className={classes.editorListItem}>
              <CodeEditor
                onChange={this.handleEditorChange}
                mode="yaml"
                value={this.state.editorValue}
                className={this.props.classes.codeEditor}
              />
            </ListItem>
            <ListItem>
              <ListItemText
                disableTypography
                primary={
                  <Typography variant="subtitle2">Extra context</Typography>
                }
              />
            </ListItem>
            <ListItem className={classes.contextListItem}>
              <CodeEditor
                onChange={this.handleExtraContextChange}
                mode="yaml"
                value={this.state.extraContext}
                className={classes.contextEditor}
              />
            </ListItem>
            <ListItem>
              <Grid container spacing={2} alignItems="flex-end">
                <Grid item>
                  <Button
                    spanProps={{ className: classes.analyzeButton }}
                    tooltipProps={{ title: 'Analyze' }}
                    onClick={this.handleAnalyze}
                    variant="contained"
                    color="primary">
                    Analyze
                  </Button>
                </Grid>
                <Grid item>
                  <TextField
                    className={classes.dropdown}
                    select
                    label="Simulate custom event"
                    value=""
                    onChange={this.handleCustomEventSimulate}>
                    {releaseActions.map(action => (
                      <MenuItem
                        key={`gr-${action}`}
                        value={`github-release.${action}`}>
                        <code>github-release</code>.<strong>{action}</strong>
                      </MenuItem>
                    ))}
                    {pullRequestActions.map(action => (
                      <MenuItem
                        key={`gpr-${action}`}
                        value={`github-pull-request.${action}`}>
                        <code>github-pull-request</code>.
                        <strong>{action}</strong>
                      </MenuItem>
                    ))}
                    {pullRequestActions.map(action => (
                      <MenuItem
                        key={`gpru-${action}`}
                        value={`github-pull-request-untrusted.${action}`}>
                        <code>github-pull-request-untrusted</code>.
                        <strong>{action}</strong>
                      </MenuItem>
                    ))}
                  </TextField>
                </Grid>
                {parsed && (
                  <Grid item>
                    <div>{parserOk ? '' : '⛔️ could not parse YAML'}</div>
                    <div>
                      {parserVersion === 0
                        ? ` ⚠️ Uses v0, please migrate to v1`
                        : ''}
                    </div>
                    <div>{parserChecks ? '' : ' ⚠️ not using checks'}</div>
                    <div>
                      {parserAutoCancel
                        ? ''
                        : ' ⚠️ not using autoCancelPreviousChecks: true'}
                    </div>
                  </Grid>
                )}
              </Grid>
            </ListItem>
            <ListItem>{this.renderFindings()}</ListItem>
          </List>
        </Fragment>
      </Dashboard>
    );
  }
}
