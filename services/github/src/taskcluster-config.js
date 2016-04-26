import Debug from 'debug';
import yaml from 'yaml-js';
import Promise from 'promise';
import slugid from 'slugid';
import tc from 'taskcluster-client';
import jparam from 'json-parameterization';
import _ from 'lodash';
import utils from './utils';

let debug = Debug('taskcluster-github');
let taskclusterConfig = module.exports = {};

function genGitHubEnvs (payload) {
  return {
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
  };
};

/**
 * Attach fields to a compiled taskcluster github config so that
 * it becomes a complete task graph config.
 **/
function completeTaskGraphConfig (taskclusterConfig, payload) {
  if (payload.details['event.type'].startsWith('pull_request')) {
    taskclusterConfig.scopes = [
      `assume:repo:github.com/${ payload.organization }/${ payload.repository }:pull-request`,
    ];
  } else if (payload.details['event.type'] == 'push') {
    let prefix = `assume:repo:github.com/${ payload.organization }/${ payload.repository }:branch:`;
    taskclusterConfig.scopes = [
      prefix + payload.details['event.base.repo.branch'],
    ];
  }

  taskclusterConfig.routes = [
    `taskcluster-github.${ payload.organization }.${ payload.repository }.` + payload.details['event.head.sha'],
  ];

  // each task can optionally decide if it wants github specific environment
  // variables added to it
  taskclusterConfig.tasks = taskclusterConfig.tasks.map((task) => {
    if (task.task.extra.github.env == true) {
      task.task.payload.env = _.merge(
        task.task.payload.env || {},
        genGitHubEnvs(payload)
      );
    }
    return task;
  });
  return taskclusterConfig;
};

/**
 * Taskcluster Github defaults, accessible from within user configs
 **/
let taskclusterDefaults = {
  'taskcluster.docker.provisionerId': 'aws-provisioner-v1',
  'taskcluster.docker.workerType': 'github-worker',
};

/**
 * Merges an existing taskcluster github config with a pull request message's
 * payload to generate a full task graph config.
 *  params {
 *    taskclusterConfig:  '...', A yaml string
 *    payload:            {},    GitHub WebHook message payload
 *    validator:          {}     A taskcluster.base validator instance
 *    schema:             url,   Url to the taskcluster config schema
 *  }
 **/
taskclusterConfig.processConfig = function (params) {
  let payload = params.payload;
  return new Promise(function (accept, reject) {
    try {
      let taskclusterConfig = yaml.load(params.taskclusterConfig);
      // Validate the config file
      let errors = params.validator(taskclusterConfig, params.schema);
      if (errors) {
        let error = new Error(`Validation failed against schema: ${params.schema}`);
        error.errors = errors;
        throw error;
      }

      // We need to toss out the config version number; it's the only
      // field that's not also in graph/task definitions
      let version = taskclusterConfig.version;
      delete taskclusterConfig.version;

      // Perform parameter substitutions. This happens after verification
      // because templating may change with schema version, and parameter
      // functions are used as default values for some fields.
      let parameters = _.merge(payload.details, {
        $fromNow: (text) => { return tc.fromNowJSON(text); },
        organization: payload.organization,
        repository: payload.repository,
      });
      parameters = _.merge(parameters, taskclusterDefaults);
      taskclusterConfig = jparam(taskclusterConfig, parameters);
      // Compile individual tasks, filtering any that are not intended
      // for the current github event type
      taskclusterConfig.tasks = taskclusterConfig.tasks.map((taskConfig) => {
        return {
          taskId: slugid.nice(),
          task: taskConfig,
        };
      }).filter((taskConfig) => {
        // Filter out tasks that aren't associated with the current event
        // being handled
        let events = taskConfig.task.extra.github.events;
        let branches = taskConfig.task.extra.github.branches;
        if (!utils.listContainsExpressions(events, [payload.details['event.type']])) {
          return false;
        };
        if (branches && !utils.listContainsExpressions(branches, [payload.details['event.base.repo.branch']])) {
          return false;
        };
        return true;
      });
      accept(completeTaskGraphConfig(taskclusterConfig, payload));
    } catch (e) {
      debug(e);
      reject(e);
    }
  });
};

