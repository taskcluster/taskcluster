var debug   = require('debug')('github:worker');
var yaml    = require('yaml-js');
var Promise = require('promise');
var slugid  = require('slugid');
var tc      = require('taskcluster-client');
var jparam  = require('json-parameterization');
var _       = require('lodash');

var taskclusterrc = module.exports = {};

/**
 * Compares a list of expressions and a list of values,
 * returning true if any possible combination is a match
 **/
function listContainsExpressions(expressions, values) {
  for (var i in expressions ) {
    let exp = RegExp(expressions[i], 'i');
    // just join values so that we don't have to compare multiple times
    if (exp.test(values.join(' '))) return true;
  }
  return false;
};

/**
 * Merges an existing taskclusterrc with a pull request message's
 * payload to generate a full task graph config.
 *  params {
 *    taskclusterrc: '...', A yaml string
 *    payload:       {},    GitHub WebHook message payload
 *    userInfo:      {},    User info from the GitHub API
 *    validator:     {}     A taskcluster.base validator instance
 *    schema:        url,   Url to the taskclusterrc schema
 *  }
 **/
taskclusterrc.processConfig = function(params) {
  let payload = params.payload;
  return new Promise(function(accept, reject) {
    try {
      let taskclusterConfig = yaml.load(params.taskclusterrc);
      // Validate the config file
      let errors = params.validator.check(taskclusterConfig, params.schema);
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
      taskclusterConfig = jparam(taskclusterConfig,
        _.merge(payload.details, {
          $fromNow: (text) => { return tc.fromNowJSON(text) },
          organization: payload.organization,
          repository: payload.repository
        })
      );
      // Compile individual tasks, filtering any that are not intended
      // for the current github event type
      taskclusterConfig.tasks = taskclusterConfig.tasks.map((taskConfig) => {
        return {
          taskId: slugid.v4(),
          task: taskConfig
        };
      }).filter((taskConfig) => {
        // Here we apply several layers of security policies, dropping any
        // tasks that fail a check.
        let extra = taskConfig.task.extra;
        let headUser = payload.details.headUser;
        let userOrgs = params.userInfo.orgs.map((org) => {return org.login});
        if (!listContainsExpressions(extra.github_events, [payload.details.event])) return false;
        if (listContainsExpressions(extra.whitelist.users, [headUser])) return true;
        if (listContainsExpressions(extra.whitelist.orgs, userOrgs)) return true;
        return false;
      });
      accept(taskclusterConfig);
    } catch(e) {
      debug(e);
      reject(e);
    }
  });
};
