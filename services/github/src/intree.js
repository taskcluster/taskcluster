const debug = require('debug')('taskcluster-github:intree');
const yaml = require('js-yaml');
const slugid = require('slugid');
const tc = require('taskcluster-client');
const jparam = require('json-parameterization');
const _ = require('lodash');
const jsone = require('json-e');

// Assert that only scope-valid characters are in branches
const branchTest = /^[\x20-\x7e]*$/;

module.exports = {};

/**
 * Attach fields to a compiled taskcluster github config so that
 * it becomes a complete task graph config.
 **/
function completeInTreeConfig(config, payload) {
  config.scopes = [];
  if (!branchTest.test(payload.details['event.base.repo.branch'] || '')) {
    throw new Error('Cannot have unicode in branch names!');
  }
  if (!branchTest.test(payload.details['event.head.repo.branch'] || '')) {
    throw new Error('Cannot have unicode in branch names!');
  }

  if (payload.details['event.type'].startsWith('pull_request')) {
    config.scopes = [
      `assume:repo:github.com/${ payload.organization }/${ payload.repository }:pull-request`,
    ];
  } else if (payload.details['event.type'] == 'push') {
    let prefix = `assume:repo:github.com/${ payload.organization }/${ payload.repository }:branch:`;
    config.scopes = [
      prefix + payload.details['event.base.repo.branch'],
    ];
  } else if (payload.details['event.type'] == 'release') {
    config.scopes = [
      `assume:repo:github.com/${ payload.organization }/${ payload.repository }:release`,
    ];
  } else if (payload.details['event.type'] == 'tag') {
    let prefix = `assume:repo:github.com/${ payload.organization }/${ payload.repository }:tag:`;
    config.scopes = [
      prefix + payload.details['event.head.tag'],
    ];
  }

  // each task can optionally decide if it wants github specific environment
  // variables added to it
  let stringify = x => x ? `${x}` : x;
  config.tasks = config.tasks.map((task) => {
    if (task.task.extra.github.env) {
      task.task.payload.env = _.merge(
        task.task.payload.env || {}, {
          GITHUB_EVENT: payload.details['event.type'],
          GITHUB_BRANCH: payload.details['event.base.repo.branch'],
          GITHUB_PULL_REQUEST: stringify(payload.details['event.pullNumber']),
          GITHUB_PULL_TITLE: stringify(payload.details['event.title']),
          GITHUB_BASE_REPO_NAME: payload.details['event.base.repo.name'],
          GITHUB_BASE_REPO_URL: payload.details['event.base.repo.url'],
          GITHUB_BASE_USER: payload.details['event.base.user.login'],
          GITHUB_BASE_SHA: payload.details['event.base.sha'],
          GITHUB_BASE_BRANCH: payload.details['event.base.repo.branch'],
          GITHUB_BASE_REF: payload.details['event.base.ref'],
          GITHUB_HEAD_REPO_NAME: payload.details['event.head.repo.name'],
          GITHUB_HEAD_REPO_URL: payload.details['event.head.repo.url'],
          GITHUB_HEAD_USER: payload.details['event.head.user.login'],
          GITHUB_HEAD_SHA: payload.details['event.head.sha'],
          GITHUB_HEAD_BRANCH: payload.details['event.head.repo.branch'],
          GITHUB_HEAD_TAG: payload.details['event.head.tag'],
          GITHUB_HEAD_REF: payload.details['event.head.ref'],
          GITHUB_HEAD_USER_EMAIL: payload.details['event.head.user.email'],
        }
      );
    }
    return task;
  });
  return config;
};

/**
 * Get scopes and attach them to the task.
 * v1 function
 */
function createScopes(config, payload) {
  if (payload.tasks_for === 'github-pull-request') {
    config.scopes = [
      `assume:repo:github.com/${ payload.organization }/${ payload.repository }:pull-request`,
    ];
  } else if (payload.tasks_for === 'github-push') {
    if (payload.body.ref.split('/')[1] === 'tags') {
      let prefix = `assume:repo:github.com/${ payload.organization }/${ payload.repository }:tag:`;
      config.scopes = [
        prefix + payload.details['event.head.tag'],
      ];
    } else {
      let prefix = `assume:repo:github.com/${ payload.organization }/${ payload.repository }:branch:`;
      config.scopes = [
        prefix + payload.details['event.base.repo.branch'],
      ];
    }
  } else if (payload.tasks_for === 'github-release') {
    config.scopes = [
      `assume:repo:github.com/${ payload.organization }/${ payload.repository }:release`,
    ];
  }

  return config;
}

/**
 * Returns a function that merges an existing taskcluster github config with
 * a pull request message's payload to generate a full task graph config.
 *  params {
 *    config:             '...', A yaml string
 *    payload:            {},    GitHub WebHook message payload
 *    schema:             url,   Url to the taskcluster config schema
 *  }
 **/
module.exports.setup = async function({cfg, schemaset}) {
  let slugids = {};
  let as_slugid = (label) => {
    let rv;
    if (rv = slugids[label]) {
      return rv;
    } else {
      return slugids[label] = slugid.nice();
    }
  };
  const validate = await schemaset.validator(cfg.taskcluster.rootUrl);

  return function({config, payload, schema}) {
    config = yaml.safeLoad(config);
    let slugids = {};
    let as_slugid = (label) => {
      let rv;
      if (rv = slugids[label]) {
        return rv;
      } else {
        return slugids[label] = slugid.nice();
      }
    };
    let version = config.version;
    
    let errors;
    if (version == 0) {
      errors = validate(config, schema);
    } else {
      errors = validate(config, schema.replace(/\.ya?ml$/, '.v1.yaml'));
    }
    if (errors) {
      throw new Error(errors);
    }
    debug(`intree config for ${payload.organization}/${payload.repository} matches valid schema.`);

    // We need to toss out the config version number; it's the only
    // field that's not also in graph/task definitions
    delete config.version;

    // Perform parameter substitutions. This happens after verification
    // because templating may change with schema version, and parameter
    // functions are used as default values for some fields.
    if (version === 0) { // TODO: version 0 stuff to make a separate module
      config = jparam(config, _.merge(payload.details, {
        $fromNow: (text) => tc.fromNowJSON(text),
        timestamp: Math.floor(new Date()),
        organization: payload.organization,
        repository: payload.repository,
        'taskcluster.docker.provisionerId': cfg.intree.provisionerId,
        'taskcluster.docker.workerType': cfg.intree.workerType,
      }));
    } else {
      if (!branchTest.test(payload.branch || '')) {
        throw new Error('Cannot have unicode in branch names!');
      }
      if (!branchTest.test(payload.branch || '')) {
        throw new Error('Cannot have unicode in branch names!');
      }
      config = jsone(config, {
        tasks_for: payload.tasks_for,
        event: payload.body,
        as_slugid,
      });
    }

    // Compile individual tasks, filtering any that are not intended
    // for the current github event type. Append taskGroupId while
    // we're at it.
    try {
      if (version === 0) {
        config.tasks = config.tasks.map((task) => {
          return {
            taskId: slugid.nice(),
            task,
          };
        }).filter((task) => {
          // Filter out tasks that aren't associated with github at all, or with
          // the current event being handled
          if (!task.task.extra || !task.task.extra.github) {
            return false;
          }
  
          let event = payload.details['event.type'];
          let events = task.task.extra.github.events;
          let branch = payload.details['event.base.repo.branch'];
          let includeBranches = task.task.extra.github.branches;
          let excludeBranches = task.task.extra.github.excludeBranches;
  
          if (includeBranches && excludeBranches) {
            throw new Error('Cannot specify both `branches` and `excludeBranches` in the same task!');
          }
  
          return _.some(events, ev => { // TODO
            if (!event.startsWith(_.trimEnd(ev, '*'))) {
              return false;
            }
  
            if (event !== 'push') {
              return true;
            }
  
            if (includeBranches) {
              return _.includes(includeBranches, branch);
            } else if (excludeBranches) {
              return !_.includes(excludeBranches, branch);
            } else {
              return true;
            }
          });
        });
  
        // Add common taskGroupId and schedulerId. taskGroupId is always the taskId of the first
        // task in taskcluster.
        if (config.tasks.length > 0) {
          let taskGroupId = config.tasks[0].taskId;
          config.tasks = config.tasks.map((task) => {
            return {
              taskId: task.taskId,
              task: _.extend(task.task, {taskGroupId, schedulerId: cfg.taskcluster.schedulerId}),
            };
          });
        }
        return completeInTreeConfig(config, payload);
      } else {
        
        if (config.tasks.length > 0) {
          config.tasks = config.tasks.map((task) => {
            if (!task.taskId) { throw Error('The taskId is absent.'); }
            return {
              taskId: task.taskId,
              task: _.extend(task, {schedulerId: cfg.taskcluster.schedulerId}),
            };
          });
        }
        return createScopes(config, payload);
      }
    } catch (e) {
      debug('Error processing tasks!');
      throw e;
    }
  };
};
