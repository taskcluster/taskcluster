import yaml from 'js-yaml';
import slugid from 'slugid';
import tc from 'taskcluster-client';
import jparam from 'json-parameterization';
import _ from 'lodash';

/**
 * Attach fields to a compiled taskcluster github config so that
 * it becomes a complete task graph config.
 **/
function completeInTreeConfig(config, payload) {
  if (payload.details['event.type'].startsWith('pull_request')) {
    config.scopes = [
      `assume:repo:github.com/${ payload.organization }/${ payload.repository }:pull-request`,
    ];
  } else if (payload.details['event.type'] == 'push') {
    let prefix = `assume:repo:github.com/${ payload.organization }/${ payload.repository }:branch:`;
    config.scopes = [
      prefix + payload.details['event.base.repo.branch'],
    ];
  }

  config.routes = [
    `taskcluster-github.${ payload.organization }.${ payload.repository }.` + payload.details['event.head.sha'],
  ];

  // each task can optionally decide if it wants github specific environment
  // variables added to it
  config.tasks = config.tasks.map((task) => {
    if (task.task.extra.github.env) {
      task.task.payload.env = _.merge(
        task.task.payload.env || {}, {
          GITHUB_EVENT: payload.details['event.type'],
          GITHUB_BRANCH: payload.details['event.base.repo.branch'],
          GITHUB_PULL_REQUEST: payload.details['event.pullNumber'],
          GITHUB_BASE_REPO_URL: payload.details['event.base.repo.url'],
          GITHUB_BASE_USER: payload.details['event.base.user.login'],
          GITHUB_BASE_SHA: payload.details['event.base.sha'],
          GITHUB_BASE_BRANCH: payload.details['event.base.repo.branch'],
          GITHUB_BASE_REF: payload.details['event.base.ref'],
          GITHUB_HEAD_REPO_URL: payload.details['event.head.repo.url'],
          GITHUB_HEAD_USER: payload.details['event.head.user.login'],
          GITHUB_HEAD_SHA: payload.details['event.head.sha'],
          GITHUB_HEAD_BRANCH: payload.details['event.head.repo.branch'],
          GITHUB_HEAD_REF: payload.details['event.ref'],
          GITHUB_HEAD_USER_EMAIL: payload.details['event.head.user.email'],
        }
      );
    }
    return task;
  });
  return config;
};

/**
 * Merges an existing taskcluster github config with a pull request message's
 * payload to generate a full task graph config.
 *  params {
 *    config:             '...', A yaml string
 *    payload:            {},    GitHub WebHook message payload
 *    validator:          {}     A taskcluster.base validator instance
 *    schema:             url,   Url to the taskcluster config schema
 *  }
 **/
module.exports = function({config, payload, validator, schema}) {
  config = yaml.safeLoad(config);
  let errors = validator(config, schema);
  if (errors) {
    throw new Error(errors);
  }

  // We need to toss out the config version number; it's the only
  // field that's not also in graph/task definitions
  let version = config.version;
  delete config.version;

  // Perform parameter substitutions. This happens after verification
  // because templating may change with schema version, and parameter
  // functions are used as default values for some fields.
  config = jparam(config, _.merge(payload.details, {
    $fromNow: (text) => tc.fromNowJSON(text),
    organization: payload.organization,
    repository: payload.repository,
    'taskcluster.docker.provisionerId': 'aws-provisioner-v1',
    'taskcluster.docker.workerType': 'github-worker',
  }));

  // Compile individual tasks, filtering any that are not intended
  // for the current github event type
  config.tasks = config.tasks.map((task) => {
    return {
      taskId: slugid.nice(),
      task: task,
    };
  }).filter((task) => {
    // Filter out tasks that aren't associated with the current event
    // being handled
    let events = task.task.extra.github.events;
    let branches = task.task.extra.github.branches;
    return _.includes(events, payload.details['event.type']) && (!branches || branches &&
      _.includes(branches, payload.details['event.base.repo.branch']));
  });
  return completeInTreeConfig(config, payload);
};

