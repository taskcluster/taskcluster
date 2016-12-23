let debug = require('debug')('taskcluster-github');
let taskcluster = require('taskcluster-client');
let slugid = require('slugid');
let yaml = require('js-yaml');
let assert = require('assert');
let _ = require('lodash');

let INSPECTOR_URL = 'https://tools.taskcluster.net/task-group-inspector/#/';

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
  constructor({credentials, monitor, reference, jobQueueName, statusQueueName, intree, context}) {
    assert(credentials.username, 'credentials.username must be provided');
    assert(credentials.password, 'credentials.password must be provided');
    assert(monitor, 'monitor is required for statistics');
    assert(monitor, 'reference must be provided');
    assert(intree, 'intree configuration builder must be provided');
    this.credentials = credentials;
    this.monitor = monitor;
    this.reference = reference;
    this.intree = intree;
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
    await this.jobListener.bind(githubEvents.pullRequest());
    await this.jobListener.bind(githubEvents.push());

    // Listen for state changes to the taskcluster tasks and taskgroups
    // We only need to listen for failure and exception events on
    // tasks. We wait for the entire group to be resolved before checking
    // for success.
    let queueEvents = new taskcluster.QueueEvents();
    await this.statusListener.bind(queueEvents.taskFailed({schedulerId: 'taskcluster-github'}));
    await this.statusListener.bind(queueEvents.taskException({schedulerId: 'taskcluster-github'}));
    await this.statusListener.bind(queueEvents.taskGroupResolved({schedulerId: 'taskcluster-github'}));

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
  let taskGroupId = message.payload.taskGroupId || message.payload.status.taskGroupId;
  debug(`handling state change for task-group ${taskGroupId}`);

  let build = await this.context.Builds.load({
    taskGroupId,
  });

  if (build.state === 'failure') {
    debug('Task group already marked as failure. Continuing.');
    return;
  };

  let state = 'success';
  if (message.exchange.endsWith('task-exception') || message.exchange.endsWith('task-failed')) {
    state = 'failure';
  }

  await build.modify((b) => {
    b.state = state;
    b.updated = new Date();
  });

  debug(`Attempting to update status for ${build.organization}/${build.repository}@${build.sha} (${state})`);
  try {
    await this.context.github.repos.createStatus({
      owner: build.organization,
      repo: build.repository,
      sha: build.sha,
      state,
      target_url: INSPECTOR_URL + taskGroupId,
      description: 'TaskGroup: ' + state,
      context: this.context.cfg.app.statusContext,
    });
  } catch (e) {
    debug(`Failed to update status: ${build.organization}/${build.repository}@${build.sha}`);
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
  let sha = message.payload.details['event.head.sha'];

  debug(`handling ${message.payload.details['event.type']} webhook for: ${organization}/${repository}@${sha}`);
  let repoconf = undefined;

  // Try to fetch a .taskcluster.yml file for every request
  try {
    let tcyml = await context.github.repos.getContent({
      owner: organization,
      repo: repository,
      path: '.taskcluster.yml',
      ref: sha,
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
  if (! await isCollaborator({login, organization, repository, sha, context})) {
    return;
  }

  // Now we can try processing the config and kicking off a task.
  try {
    let graphConfig = this.intree({
      config: repoconf,
      payload: message.payload,
      validator: context.validator,
      schema: 'http://schemas.taskcluster.net/github/v1/taskcluster-github-config.json#',
    });
    if (graphConfig.tasks.length) {
      let taskGroupId = graphConfig.tasks[0].task.taskGroupId;
      let queue = new taskcluster.Queue({
        baseUrl: context.cfg.taskcluster.queueBaseUrl,
        credentials: context.cfg.taskcluster.credentials,
        authorizedScopes: graphConfig.scopes,
      });
      await Promise.all(graphConfig.tasks.map(t => queue.createTask(t.taskId, t.task)));

      // We used to comment on every commit, but setting the status
      // is a nicer thing to do instead. It contains all of the same
      // information.
      await context.github.repos.createStatus({
        owner: organization,
        repo: repository,
        sha,
        state: 'pending',
        target_url: INSPECTOR_URL + taskGroupId,
        description: 'TaskGroup: Running',
        context: context.cfg.app.statusContext,
      });

      let now = new Date();
      await context.Builds.create({
        organization,
        repository,
        sha,
        taskGroupId,
        state: 'pending',
        created: now,
        updated: now,
      }).catch(async (err) => {
        if (err.code !== 'EntityAlreadyExists') {
          throw err;
        }
        let build = await this.Builds.load({
          taskGroupId,
        });
        assert.equal(build.state, 'pending', `State for ${organization}/${repository}@${sha}
          already exists but is set to ${build.state} instead of pending!`);
        assert.equal(build.organization, organization);
        assert.equal(build.repository, repository);
        assert.equal(build.sha, sha);
      });
    } else {
      debug(`intree config for ${organization}/${repository} compiled with zero tasks. Skipping.`);
    }
  } catch (e) {
    let errorBody = e.body && e.body.error || e.message;
    // Let's prettify any objects
    if (typeof errorBody == 'object') {
      errorBody = JSON.stringify(errorBody, null, 4);
    }
    // Warn the user know that there was a problem processing their
    // config file with a comment.
    await context.github.repos.createCommitComment({
      owner: organization,
      repo: repository,
      sha,
      body: 'Submitting the task to Taskcluster failed. ' +
      '\nDetails:\n\n```js\n' +  errorBody + '\n```',
    });
    throw e;
  }
}

async function isCollaborator({login, organization, repository, sha, context}) {
  if (login === organization) {
    debug(`Checking collaborator: ${login} === ${organization}: True!`);
    return true;
  }

  // If the user is in the org, we consider them
  // qualified to trigger any job in that org.
  try {
    await context.github.orgs.checkMembership({
      org: organization,
      owner: login,
    });
    debug(`Checking collaborator: ${login} is a member of ${organization}: True!`);
    return true;
  } catch (e) {
    if (e.code == 404) {
      // Only a 404 error means the user isn't a member
      // anything else should just throw like normal
    } else {
      throw e;
    }
  }

  // GithubAPI's collaborator check returns an error if a user isn't
  // listed as a collaborator.
  try {
    await context.github.repos.checkCollaborator({
      owner: organization,
      repo: repository,
      collabuser: login,
    });
    // No error, the user is a collaborator
    debug(`Checking collaborator: ${login} is a collaborator on ${organization}/${repository}: True!`);
    return true;
  } catch (e) {
    if (e.code == 404) {
      // Only a 404 error means the user isn't a collaborator
      // anything else should just throw like normal
    } else if (e.code == 403) {
      let msg = `Taskcluster does not have permission to check for repository collaborators.
        Ensure that it is a member of a team with __write__ access to this repository!`;
      debug(`Insufficient permissions to check for collaborators of ${organization}/${repository}. Skipping.`);
      await context.github.repos.createCommitComment({
        owner: organization,
        repo: repository,
        sha,
        body: msg,
      });
      return false;
    } else {
      throw e;
    }
  }

  // If all of the collaborator checks fail, we should post to the commit
  // and ignore the request
  let msg = `@${login} does not have permission to trigger tasks.`;
  debug(`${login} does not have permissions for ${organization}/${repository}. Skipping.`);
  await context.github.repos.createCommitComment({
    owner: organization,
    repo: repository,
    sha,
    body: 'TaskCluster: ' + msg,
  });
  return false;
}
