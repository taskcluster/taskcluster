import Debug from 'debug';
import intree from './intree';
import taskcluster from 'taskcluster-client';
import slugid from 'slugid';
import yaml from 'js-yaml';
import _ from 'lodash';

let debug = Debug('taskcluster-github');
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
  organization = message.payload.organization.replace(/%/g, '.');
  repository = message.payload.repository.replace(/%/g, '.');

  debug('handling webhook: ', message);
  let repoconf = undefined;

  // Try to fetch a .taskcluster.yml file for every request
  try {
    repoconf = new Buffer(await context.github.repos.getContent({
      user: organization,
      repo: repository,
      path: '.taskcluster.yml',
      ref: message.payload.details['event.head.sha'],
    }), 'base64').toString();
  } catch (e) {
    if (e.code === 404) {
      debug(`${organization}/${repository} has no '.taskcluster.yml'. Skipping.`);
      return;
    }
    if (_.endsWith(e.message, '</body>\n</html>\n') && e.message.length > 10000) {
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
  let c = yaml.safeLoad(repoconf);
  c.tasks = (c.tasks || []).filter((task) => _.has(task, 'extra.github'));
  if (c.tasks.length === 0) {
    debug('Skipping tasks because no task with "extra.github" exists!');
    debug(`Repository: ${organization}/${repository}`);
    return;
  }

  // Decide if a user has permissions to run tasks.
  let login = message.payload.details['event.head.user.login'];
  let isCollaborator = false;

  if (login === organization) {
    isCollaborator = true;
  }

  if (!isCollaborator) {
    // If the user is in the org, we consider them
    // qualified to trigger any job in that org.
    try {
      github.orgs.checkMembership({
        org: organization,
        user: login,
      });
      isCollaborator = true;
    } catch (e) {
      if (e.code == 404) {
        // Only a 404 error means the user isn't a member
        // anything else should just throw like normal
      } else {
        throw e;
      }
    }
  }

  if (!isCollaborator) {
    // GithubAPI's collaborator check returns an error if a user isn't
    // listed as a collaborator.
    try {
      await context.github.repos.checkCollaborator({
        user: organization,
        repo: repository,
        collabuser: login,
      });
      // No error, the user is a collaborator
      isCollaborator = true;
    } catch (e) {
      if (e.code == 404) {
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
    debug(`${login} does not have permissions for ${organization}/${repository}. Skipping.`);
    await context.github.repos.createCommitComment({
      user: organization,
      repo: repository,
      sha: message.payload.details['event.head.sha'],
      body: 'TaskCluster: ' + msg,
    });
  }

  // Now we can try processing the config and kicking off a task.
  try {
    let graphConfig = intree({
      config: repoconf,
      payload: message.payload,
      validator: context.validator,
      schema: 'http://schemas.taskcluster.net/github/v1/taskcluster-github-config.json#',
    });
    if (graphConfig.tasks.length) {
      let graph = await context.scheduler.createTaskGraph(slugid.nice(), graphConfig);
      // On pushes, leave a comment on the commit
      if (message.payload.details['event.type'] == 'push') {
        await context.github.repos.createCommitComment({
          user: organization,
          repo: repository,
          sha: message.payload.details['event.head.sha'],
          body: 'TaskCluster: ' + INSPECTOR_URL + graph.status.taskGraphId + '/',
        });
      }
    } else {
      debug('intree config compiled with zero tasks. Skipping');
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
    await context.github.repos.createCommitComment({
      user: organization,
      repo: repository,
      sha: message.payload.details['event.head.sha'],
      body: 'Submitting the task to TaskCluster failed. ' + errorMessage
      + 'Details:\n\n```js\n' +  errorBody + '\n```',
    });
    throw e;
  }
};

/**
 * Post updates to GitHub, when the status of a task changes.
 * TaskCluster States: http://docs.taskcluster.net/queue/exchanges/
 * GitHub Statuses: https://developer.github.com/v3/repos/statuses/
 **/
worker.graphStateChangeHandler = async function(message, context) {
  let statusMapping = {
    running:  'pending',
    blocked:  'failure',
    finished: 'success',
  };
  debug('handling state change for message: ', message);
  let route = message.routes[0].split('.');
  try {
    await context.github.repos.createStatus({
      user: route[0],
      repo: route[1],
      sha: route[2],
      state:        StatusMapping[message.payload.status.state],
      target_url:   INSPECTOR_URL + message.payload.status.taskGraphId + '/',
      description:  'TaskGraph: ' + message.payload.status.state,
      context:      'Taskcluster',
    });
  } catch (e) {
    debug(`Failed to update status: ${route[0]}/${route[1]}@${route[2]}`);
    throw e;
  }
};

