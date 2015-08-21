var debug       = require('debug')('github:worker');
var tcrc        = require('./taskclusterrc');
var github      = require('./github');
var common      = require('./common');
var taskcluster = require('taskcluster-client')
var slugid      = require('slugid');

var worker = module.exports = {};

/**
 * If a .taskclusterrc exists, attempt to turn it into a taskcluster
 * graph config, and submit it to the scheduler.
 **/
worker.webHookHandler = async function(message, context) {
  debug('handling webhook: ', message);
  let msgPayload = message.payload;

  // Try to fetch a taskclusterrc file for every request
  let taskclusterrc = await context.githubAPI.repos(
    msgPayload.organization, msgPayload.repository
  ).contents('.taskclusterrc').read()

  let schema = common.SCHEMA_PREFIX_CONST + 'taskclusterrc.json#';
  if (taskclusterrc) {
    // Attach some info about the user who created a request which
    // needs to come directly from the GitHub API. This info will be
    // used to decide which tasks a user has permissions to run.
    let headUserInfo = {};
    headUserInfo.orgs = await context.githubAPI.users(
      msgPayload.details.headUser
    ).orgs.fetch();

    try {
      let graphConfig = await tcrc.processConfig({
        taskclusterrc: taskclusterrc,
        payload:       msgPayload,
        userInfo:      headUserInfo,
        validator:     context.validator,
        schema:        schema
      });
      if (graphConfig.tasks.length) {
        await context.scheduler.createTaskGraph(slugid.v4(), graphConfig);
      } else {
        debug('graphConfig compiled with zero tasks: skipping');
      }
    } catch(e) {
      debug(e);
      // Let the user know that there was a problem processing their
      // config file
      let statusMessage = {
        state:        'error',
        description:  e.toString(),
        context:      'TaskCluster',
        target_url:   schema
      };
      await github.updateStatus(context.githubAPI,
        msgPayload.organization,
        msgPayload.repository,
        msgPayload.details.headSha,
        statusMessage);
    }
  }
};

/**
 * Post updates to GitHub, when the status of a task changes.
 **/
worker.graphStateChangeHandler = async function(message, context) {
  try {
    debug('handling state change for message: ', message);
    let inspectorUrl = 'https://tools.taskcluster.net/task-graph-inspector/#';
    let statusMessage = {
      state:        github.StatusMap[message.payload.status.state],
      target_url:   inspectorUrl + message.payload.status.taskGraphId,
      description:  'TaskGraph: ' + message.payload.status.state,
      context:      'TaskCluster'
    };
    let route = message.routes[0].split('.');
    await github.updateStatus(context.githubAPI, route[1], route[2], route[3],
       statusMessage);
  } catch(e) {
    debug('Failed to update GitHub commit status: ', e);
  }
};
