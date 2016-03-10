import Debug from 'debug';
import tcconfig from './taskcluster-config';
import github from './github';
import common from './common';
import utils from './utils';
import taskcluster from 'taskcluster-client';
import slugid from 'slugid';

let debug = Debug('github:worker');
var worker = module.exports = {};

const INSPECTOR_URL = 'https://tools.taskcluster.net/task-graph-inspector/#';

/**
 * If a .taskcluster.yml exists, attempt to turn it into a taskcluster
 * graph config, and submit it to the scheduler.
 **/
worker.webHookHandler = async function(message, context) {
  debug('handling webhook: ', message);
  let taskclusterConfig = undefined;
  try {
    // Try to fetch a .taskcluster.yml file for every request
    taskclusterConfig = await context.githubAPI.repos(
      message.payload.organization, message.payload.repository
    ).contents('.taskcluster.yml').read({
      ref: message.payload.details['event.base.repo.branch']
    });

    // Decide if a user has permissions to run tasks.
    let login = message.payload.details['event.head.user.login']
    let isCollaborator = false;

    if (login == message.payload.organization) {
      isCollaborator = true;
    }

    if (!isCollaborator) {
      isCollaborator = await context.githubAPI.orgs(
        message.payload.organization
      ).members.contains(login);
    }

    if (!isCollaborator) {
      // GithubAPI's collaborator check returns an error if a user isn't
      // listed as a collaborator.
      try {
        await context.githubAPI.repos(
          message.payload.organization, message.payload.repository
        ).collaborators(login).fetch();
        // No error, the user is a collaborator
        isCollaborator = true;
      } catch (e) {
          if (e.status == 404) {
            // Only a 404 error means the user isn't a collaborator
            // anything else should just throw like normal
            debug(e.message);
          } else {
            throw(e);
          }
      }
    }

    // If all of the collaborator checks fail, we should post to the commit
    // and ignore the request
    if (!isCollaborator) {
      let msg = `@${login} does not have permission to trigger tasks.`;
      await github.addCommitComment(
        context.githubAPI,
        message.payload.organization,
        message.payload.repository,
        message.payload.details['event.head.sha'],
        'TaskCluster: ' + msg);
      throw(new Error(msg));
    }
  } catch (e) {
    debug(e);
    throw(e);
  }

  // Now we can try processing the config and kicking off a task.
  try {
    let graphConfig = await tcconfig.processConfig({
      taskclusterConfig:  taskclusterConfig,
      payload:            message.payload,
      validator:          context.validator,
      schema:             common.SCHEMA_PREFIX_CONST + 'taskcluster-github-config.json#'
    });
    if (graphConfig.tasks.length) {
      let graph = await context.scheduler.createTaskGraph(slugid.nice(), graphConfig);
      // On pushes, leave a comment on the commit
      if (message.payload.details['event.type'] == 'push') {
        await github.addCommitComment(
          context.githubAPI,
          message.payload.organization,
          message.payload.repository,
          message.payload.details['event.head.sha'],
          'TaskCluster-GitHub: ' + INSPECTOR_URL + graph.status.taskGraphId);
      }
    } else {
      debug('graphConfig compiled with zero tasks: skipping');
    }
  } catch(e) {
    debug(e);
    let errorMessage = e.message;
    let errorBody = e.errors || e.body.error;
    // Let's prettify any objects
    if (typeof(errorBody) == 'object') {
      errorBody = JSON.stringify(errorBody, null, 4)
    }
    // Warn the user know that there was a problem processing their
    // config file with a comment.
    await github.addCommitComment(context.githubAPI,
      message.payload.organization,
      message.payload.repository,
      message.payload.details['event.head.sha'],
      'Submitting the task to TaskCluster failed. ' + errorMessage
      + 'Details:\n\n```js\n' +  errorBody + '\n```')
  }
};

/**
 * Post updates to GitHub, when the status of a task changes.
 **/
worker.graphStateChangeHandler = async function(message, context) {
  try {
    debug('handling state change for message: ', message);
    let statusMessage = {
      state:        github.StatusMap[message.payload.status.state],
      target_url:   INSPECTOR_URL + message.payload.status.taskGraphId,
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

