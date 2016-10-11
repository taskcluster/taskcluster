let debug = require('debug')('taskcluster-github');
let intree = require('./intree');
let taskcluster = require('taskcluster-client');
let slugid = require('slugid');
let yaml = require('js-yaml');
let assert = require('assert');
let _ = require('lodash');

let INSPECTOR_URL = 'https://tools.taskcluster.net/task-graph-inspector/#';
let STATUS_MAPPING = {
  running:  'pending',
  blocked:  'failure',
  finished: 'success',
};

/**
 * Create handlers
 *
 * options:
 * {
 *   credentials:        // Pulse credentials
 *   queueName:          // Queue name (optional)
 *   reference:          // A taskcluster exchange reference for this service
 *   monitor:            // base.monitor({...})
 *   jobQueueName:       // An optional queue name for the jobs handler
 *   statusQueueName:    // An optional queue name for the status handler
 *   context:            // Things we want to make available inside handlers
 * }
 */
class Handlers {
  constructor({credentials, monitor, reference, jobQueueName, statusQueueName, context}) {
    assert(credentials.username, 'credentials.username must be provided');
    assert(credentials.password, 'credentials.password must be provided');
    assert(monitor, 'monitor is required for statistics');
    assert(monitor, 'reference must be provided');
    this.credentials = credentials;
    this.monitor = monitor;
    this.reference = reference;
    this.connection = null;
    this.statusListener = null;
    this.jobListener = null;
    this.statusQueueName = statusQueueName;  // Optional
    this.jobQueueName = jobQueueName;  // Optional
    this.context = context;
  }

  async setup() {
    assert(this.connection === null, 'Cannot setup twice!');
    this.connection = new taskcluster.PulseConnection(this.credentials);
    this.statusListener = new taskcluster.PulseListener({
      queueName: this.statusQueueName,
      connection: this.connection,
    });
    this.jobListener = new taskcluster.PulseListener({
      queueName: this.jobQueueName,
      connection: this.connection,
    });

    // Listen for new jobs created via the api webhook endpoint
    let GithubEvents = taskcluster.createClient(this.reference);
    let githubEvents = new GithubEvents();
    await this.jobListener.bind(githubEvents.pullRequest({organization: '*', repository: '*', action: '*'}));
    await this.jobListener.bind(githubEvents.push({organization: '*', repository: '*'}));

    // Listen for state changes to the taskcluster taskgraph
    let schedulerEvents = new taskcluster.SchedulerEvents();
    let route = 'route.taskcluster-github.*.*.*';
    await this.statusListener.bind(schedulerEvents.taskGraphRunning(route));
    await this.statusListener.bind(schedulerEvents.taskGraphBlocked(route));
    await this.statusListener.bind(schedulerEvents.taskGraphFinished(route));

    this.jobListener.on('message', this.monitor.timedHandler('joblistener', jobHandler.bind(this)));
    this.statusListener.on('message', this.monitor.timedHandler('statuslistener', statusHandler.bind(this)));

    await this.jobListener.connect();
    await this.statusListener.connect();

    // If this is awaited, it should return [undefined, undefined]
    return Promise.all([this.jobListener.resume(), this.statusListener.resume()]);
  }

  async terminate() {
    await this.connection.close();
  }
}
module.exports = Handlers;

/**
 * Post updates to GitHub, when the status of a task changes.
 * TaskCluster States: http://docs.taskcluster.net/queue/exchanges/
 * GitHub Statuses: https://developer.github.com/v3/repos/statuses/
 **/
async function statusHandler(message) {
  debug('handling state change for message: ', message);
  let route = message.routes[0].split('.');
  try {
    await this.context.github.repos.createStatus({
      user: route[1],
      repo: route[2],
      sha: route[3],
      state: STATUS_MAPPING[message.payload.status.state],
      target_url: INSPECTOR_URL + message.payload.status.taskGraphId + '/',
      description: 'TaskGraph: ' + message.payload.status.state,
      context: 'Taskcluster',
    });
  } catch (e) {
    debug(`Failed to update status: ${route[1]}/${route[2]}@${route[3]}`);
    throw e;
  }
}

/**
 * If a .taskcluster.yml exists, attempt to turn it into a taskcluster
 * graph config, and submit it to the scheduler.
 **/
async function jobHandler(message) {
  let context = this.context;

  // We must attempt to convert the sanitized fields back to normal here. 
  // Further discussion of how to deal with this cleanly is in
  // https://github.com/taskcluster/taskcluster-github/issues/52
  let organization = message.payload.organization.replace(/%/g, '.');
  let repository = message.payload.repository.replace(/%/g, '.');

  debug(`handling ${message.payload.details['event.type']} webhook for: ${organization}/${repository}`);
  let repoconf = undefined;

  // Try to fetch a .taskcluster.yml file for every request
  try {
    let tcyml = await context.github.repos.getContent({
      user: organization,
      repo: repository,
      path: '.taskcluster.yml',
      ref: message.payload.details['event.head.sha'],
    });
    repoconf = new Buffer(tcyml.content, 'base64').toString();
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
  let isCollaborator = checkCollaborator({login, organization, repository, message, context});

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
    let errorBody = e.message || e.body.error;
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
}

async function checkCollaborator({login, organization, repository, message, context}) {
  let isCollaborator = false;
  if (login === organization) {
    isCollaborator = true;
  }

  if (!isCollaborator) {
    // If the user is in the org, we consider them
    // qualified to trigger any job in that org.
    try {
      context.github.orgs.checkMembership({
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
  return isCollaborator;
}
