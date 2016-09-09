import Debug from 'debug';
import tcconfig from './taskcluster-config';
import github from './github';
import utils from './utils';
import taskcluster from 'taskcluster-client';
import slugid from 'slugid';
import yaml from 'js-yaml';
import _ from 'lodash';

let debug = Debug('taskcluster-github:worker');
let worker = module.exports = {};

const INSPECTOR_URL = 'https://tools.taskcluster.net/task-graph-inspector/#';

/**
 * If a .taskcluster.yml exists, attempt to turn it into a taskcluster
 * graph config, and submit it to the scheduler.
 **/
worker.webHookHandler = async function(message, context) {
  // We must attempt to convert the sanitized fields back to normal here. 
  // Further discussion of how to deal with this cleanly is in
  // https://github.com/taskcluster/taskcluster-github/issues/52
  message.payload.organization = message.payload.organization.replace(/%/g, '.');
  message.payload.repository = message.payload.repository.replace(/%/g, '.');

  debug('handling webhook: ', message);
  let taskclusterConfig = undefined;

  // Try to fetch a .taskcluster.yml file for every request
  try {
    taskclusterConfig = await context.github.repos(
      message.payload.organization, message.payload.repository
    ).contents('.taskcluster.yml').read({
      ref: message.payload.details['event.head.sha'],
    });
  } catch (e) {
    if (e.status === 404) {
      debug(`${message.payload.organization}/${message.payload.repository} has no '.taskcluster.yml'. Skipping.`);
      return;
    }
    if (_.endsWith(e.message, '</body>\n</html>\n') && e.message.length > 10000){
      // We kept getting full html 500/400 pages from github in the logs.
      // I consider this to be a hard-to-fix bug in octokat, so let's make
      // the logs usable for now and try to fix this later. It's a relatively
      // rare occurence.
      debug('Detected an extremeley long error. Truncating!');
      e.message = _.join(_.take(e.message, 100).concat('...'), '');
      e.stack = e.stack.split('</body>\n</html>\n')[1] || e.stack;
    }
    throw e;
  }

  // Check if this is meant to be built by tc-github at all.
  // This is a bit of a hack, but is needed for bug 1274077 for now
  let c = yaml.safeLoad(taskclusterConfig);
  c.tasks = (c.tasks || []).filter((task) => _.has(task, 'extra.github'));
  if (c.tasks.length === 0) {
    debug('Skipping tasks because no task with "extra.github" exists!');
    debug(`Repository: ${message.payload.organization}/${message.payload.repository}`);
    return;
  }

  // Decide if a user has permissions to run tasks.
  let login = message.payload.details['event.head.user.login'];
  let isCollaborator = false;

  if (login == message.payload.organization) {
    isCollaborator = true;
  }

  if (!isCollaborator) {
    isCollaborator = await context.github.orgs(
      message.payload.organization
    ).members.contains(login);
  }

  if (!isCollaborator) {
    // GithubAPI's collaborator check returns an error if a user isn't
    // listed as a collaborator.
    try {
      await context.github.repos(
        message.payload.organization, message.payload.repository
      ).collaborators(login).fetch();
      // No error, the user is a collaborator
      isCollaborator = true;
    } catch (e) {
      if (e.status == 404) {
        // Only a 404 error means the user isn't a collaborator
        // anything else should just throw like normal
      } else {
        throw e;
      }
    }
  }

  // If all of the collaborator checks fail, we should post to the commit
  // and ignore the request
  if (!isCollaborator) {
    let msg = `@${login} does not have permission to trigger tasks.`;
    await github.addCommitComment(
      context.github,
      message.payload.organization,
      message.payload.repository,
      message.payload.details['event.head.sha'],
      'TaskCluster: ' + msg);
    debug(msg + ' skipping.');
  }

  // Now we can try processing the config and kicking off a task.
  try {
    let graphConfig = await tcconfig.processConfig({
      taskclusterConfig:  taskclusterConfig,
      payload:            message.payload,
      validator:          context.validator,
      schema:             'http://schemas.taskcluster.net/github/v1/taskcluster-github-config.json#',
    });
    if (graphConfig.tasks.length) {
      let graph = await context.scheduler.createTaskGraph(slugid.nice(), graphConfig);
      // On pushes, leave a comment on the commit
      if (message.payload.details['event.type'] == 'push') {
        await github.addCommitComment(
          context.github,
          message.payload.organization,
          message.payload.repository,
          message.payload.details['event.head.sha'],
          'TaskCluster-GitHub: ' + INSPECTOR_URL + graph.status.taskGraphId);
      }
    } else {
      debug('graphConfig compiled with zero tasks: skipping');
    }
  } catch (e) {
    let errorMessage = e.message;
    let errorBody = e.errors || e.body.error;
    // Let's prettify any objects
    if (typeof errorBody == 'object') {
      errorBody = JSON.stringify(errorBody, null, 4);
    }
    // Warn the user know that there was a problem processing their
    // config file with a comment.
    await github.addCommitComment(context.github,
      message.payload.organization,
      message.payload.repository,
      message.payload.details['event.head.sha'],
      'Submitting the task to TaskCluster failed. ' + errorMessage
      + 'Details:\n\n```js\n' +  errorBody + '\n```');
    throw e;
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
      context:      'TaskCluster',
    };
    let route = message.routes[0].split('.');
    await github.updateStatus(context.github, route[1], route[2], route[3],
       statusMessage);
  } catch (e) {
    debug('Failed to update GitHub commit status!');
    throw e;
  }
};

