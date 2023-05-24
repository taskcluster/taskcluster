import React, { Component, Fragment } from 'react';
import { withApollo } from 'react-apollo';
import { withStyles } from '@material-ui/core/styles';
import List from '@material-ui/core/List';
import ListItem from '@material-ui/core/ListItem';
import ListItemText from '@material-ui/core/ListItemText';
import Typography from '@material-ui/core/Typography';
import { dump, load } from 'js-yaml';
import debounce from 'lodash.debounce';
import jsone from 'json-e';
import CodeEditor from '../../components/CodeEditor';
import Dashboard from '../../components/Dashboard';
import Button from '../../components/Button';
import urls from '../../utils/urls';
import { siteSpecificVariable } from '../../utils/siteSpecific';
import ajv from '../../utils/ajv';
import fromNowJSON from '../../utils/fromNowJSON';
import * as testPayloads from './test-payload';

const prefetchSchema = async () => {
  ajv.addSchema(
    await (await fetch(urls.schema('common', 'metaschema.json'))).json()
  );
  ajv.addSchema(
    await (
      await fetch(urls.schema('github', 'v1/taskcluster-github-config.json'))
    ).json(),
    'github-v0'
  );
  ajv.addSchema(
    await (
      await fetch(urls.schema('github', 'v1/taskcluster-github-config.v1.json'))
    ).json(),
    'github-v1'
  );
};

prefetchSchema();

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
          $if: 'tasks_for == "github-pull-request"',
          then: '${event.pull_request.head.sha}',
          else: '${event.after}',
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

const testJsoneEvent = (doc, event, tasksFor, action) => {
  const cfg = { ...doc };

  if (cfg.version !== 1) {
    cfg.$fromNow = text => fromNowJSON(text);
    cfg.timestamp = Math.floor(new Date());
    cfg.organization = 'test-org';
    cfg.repository = 'test-repo';
    cfg['taskcluster.docker.provisionerId'] = 'test-provisioner';
    cfg['taskcluster.docker.workerType'] = 'test-worker-type';
  }

  const context = {
    event,
    tasks_for: tasksFor,
    action,

    // v1
    taskcluster_root_url: 'https://tc.root',
    ref: 'refs/heads/master',
    as_slugid: text => `${text.replace(/[^a-zA-Z0-9_-]/g, '_')}_slugid`,

    // not sure where those are coming form yet
    after: 'after',
  };

  // console.log(tasksFor, action, context, cfg);

  return jsone(cfg, context);
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
    maxHeight: 600,
    height: 600,
  },
  findingsTable: {
    fontSize: 14,
    'td, th': {
      padding: theme.spacing(1),
      paddingLeft: theme.spacing(2),
      paddingRight: theme.spacing(2),
    },
  },
  code: {
    fontFamily: 'monospace',
    fontSize: 12,
    border: '1px solid #ccc',
    padding: theme.spacing(2),
  },
}))
export default class TcYamlDebug extends Component {
  initialState = {
    findings: [],
    editorValue: getTaskDefinition({}),
  };

  state = this.initialState;

  handleEditorChange = editorValue => {
    this.setState({
      editorValue,
    });
    this.analyzeLazy();
  };

  analyzeLazy = debounce(() => this.handleAnalyze(), 1000);

  handleAnalyze = () => {
    this.setState({ findings: [] });
    const findings = [];
    const addFinding = (type, sentiment, message, tasks) =>
      findings.push({ type, sentiment, message, tasks });
    let doc;
    let schema = 'github-v1';

    try {
      doc = load(this.state.editorValue);
      addFinding('parser', '✅', 'Valid YAML - nice!');
    } catch (e) {
      addFinding('parser', '⛔️', e.message);
    }

    if (doc.version !== 1) {
      addFinding('version', '⚠️', 'Not using version 1');
      schema = 'github-v0';
    } else {
      addFinding('version', '✅', 'Using version 1');
    }

    const validation = ajv.validate(schema, doc);

    if (validation) {
      addFinding('schema', '✅', 'Valid schema, amazing!');
    } else {
      ajv.errors.forEach((error, i) => {
        addFinding(
          `schema-${i}`,
          '⚠️',
          `${error.instancePath} ${error.message} ${JSON.stringify(
            error.params
          )}`
        );
      });
    }

    // console.log(validation, ajv.errors, doc);

    if (doc?.reporting !== 'checks-v1') {
      addFinding('reporting', '⚠️', 'Not using checks API');
    } else {
      addFinding('reporting', '✅', 'Using checks API');
    }

    // check policy recommendations

    if (!doc?.tasks) {
      addFinding('tasks', '⛔️', 'No tasks defined!');
    }

    const runEvent = (name, payload, tasksFor, action) => {
      const isOkAction =
        !action || ['opened', 'synchronize', 'reopened'].includes(action);

      try {
        const parsed = testJsoneEvent(doc, payload, tasksFor, action);
        const suspicious = !isOkAction && parsed.tasks.length > 0;

        addFinding(
          `${name}-tasks`,
          suspicious ? '⛔️' : '✅',
          `${parsed.tasks.length} task(s) defined ${
            suspicious ? ', but normally should be 0' : ''
          }`,
          parsed.tasks
        );
      } catch (e) {
        addFinding(name, '⛔️', e.message);
      }
    };

    runEvent('github-push', testPayloads.push, 'github-push');
    runEvent('github-release', testPayloads.release, 'github-release');
    [
      'opened',
      'synchronize',
      'reopened',
      // rest is suspicious if produces tasks
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
    ].forEach(action =>
      runEvent(
        `github-pull-request.${action}`,
        { ...testPayloads.pullRequest, action },
        'github-pull-request',
        action
      )
    );

    this.setState({ findings });
  };

  renderEditor() {
    return (
      <CodeEditor
        onChange={this.handleEditorChange}
        mode="yaml"
        value={this.state.editorValue}
        className={this.props.classes.codeEditor}
      />
    );
  }

  renderFindings() {
    const { findings } = this.state;

    if (!findings.length) {
      return;
    }

    return (
      <table className={this.props.classes.findingsTable}>
        <thead>
          <tr>
            <th>?</th>
            <th>Type</th>
            <th>Message</th>
            <th>Tasks</th>
          </tr>
        </thead>
        <tbody>
          {findings.map(({ type, sentiment, message, tasks }) => (
            <tr key={type}>
              <td>{sentiment} </td>
              <td>
                <strong>{type}</strong>
              </td>
              <td>{message}</td>
              <td>
                {tasks?.length && (
                  <details>
                    <summary>Rendered tasks</summary>
                    <pre className={this.props.classes.code}>{dump(tasks)}</pre>
                  </details>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    );
  }

  render() {
    const { classes } = this.props;

    return (
      <Dashboard title="GitHub .taskcluster.yml debug" disableTitleFormatting>
        <Fragment>
          <Typography className={classes.mainHeading} variant="h6">
            Lint your <code>.taskclster.yml</code>
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
            </ListItem>
            <ListItem className={classes.editorListItem}>
              {this.renderEditor()}
            </ListItem>
            <ListItem>
              <Button
                spanProps={{ className: classes.analyzeButton }}
                tooltipProps={{ title: 'Analyze' }}
                onClick={this.handleAnalyze}
                variant="contained"
                color="primary">
                Analyze
              </Button>
            </ListItem>
            <ListItem>{this.renderFindings()}</ListItem>
          </List>
        </Fragment>
      </Dashboard>
    );
  }
}
