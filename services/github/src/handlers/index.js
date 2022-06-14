const _ = require('lodash');
const stringify = require('fast-json-stable-stringify');
const crypto = require('crypto');
const taskcluster = require('taskcluster-client');
const yaml = require('js-yaml');
const assert = require('assert');
const { consume } = require('taskcluster-lib-pulse');

const { deprecatedStatusHandler } = require('./deprecatedStatus');
const { taskGroupCreationHandler } = require('./taskGroupCreation');
const { statusHandler } = require('./status');
const { taskDefinedHandler } = require('./taskDefined');
const { jobHandler } = require('./job');
const { rerunHandler } = require('./rerun');
const { POLICIES } = require('./policies');

/**
 * Create handlers
 */
class Handlers {
  constructor(options) {
    const {
      rootUrl,
      credentials,
      monitor,
      reference,
      jobQueueName,
      deprecatedResultStatusQueueName,
      deprecatedInitialStatusQueueName,
      resultStatusQueueName,
      initialStatusQueueName,
      rerunQueueName,
      intree,
      context,
      pulseClient,
    } = options;

    assert(monitor, 'monitor is required for statistics');
    assert(reference, 'reference must be provided');
    assert(rootUrl, 'rootUrl must be provided');
    assert(intree, 'intree configuration builder must be provided');
    this.rootUrl = rootUrl;
    this.credentials = credentials;
    this.monitor = monitor;
    this.reference = reference;
    this.intree = intree;
    this.connection = null;
    this.deprecatedResultStatusQueueName = deprecatedResultStatusQueueName;
    this.resultStatusQueueName = resultStatusQueueName;
    this.jobQueueName = jobQueueName;
    this.rerunQueueName = rerunQueueName;
    this.deprecatedInitialStatusQueueName = deprecatedInitialStatusQueueName;
    this.initialStatusQueueName = initialStatusQueueName;
    this.context = context;
    this.pulseClient = pulseClient;

    this.handlerComplete = null;
    this.handlerRejected = null;

    this.commentHashCache = [];

    this.jobPq = null;
    this.resultStatusPq = null;
    this.deprecatedResultStatusPq = null;
    this.initialTaskStatusPq = null;
    this.deprecatedInitialStatusPq = null;
    this.rerunPq = null;

    this.queueClient = null;
  }

  /**
   * Set up the handlers.
   */
  async setup(options = {}) {
    assert(!this.jobPq, 'Cannot setup twice!');
    assert(!this.resultStatusPq, 'Cannot setup twice!');
    assert(!this.initialTaskStatusPq, 'Cannot setup twice!');
    assert(!this.deprecatedResultStatusPq, 'Cannot setup twice!');
    assert(!this.deprecatedInitialStatusPq, 'Cannot setup twice!');
    assert(!this.rerunPq, 'Cannot setup twice!');

    // This is a powerful Queue client without scopes to use throughout the handlers for things
    // where taskcluster-github is acting of its own accord
    // Where it is acting on behalf of a task, use this.queueClient.use({authorizedScopes: scopes}).blahblah
    // (see this.createTasks for example)
    this.queueClient = new taskcluster.Queue({
      rootUrl: this.context.cfg.taskcluster.rootUrl,
      credentials: this.context.cfg.taskcluster.credentials,
    });

    // Listen for new jobs created via the api webhook endpoint
    const GithubEvents = taskcluster.createClient(this.reference);
    const githubEvents = new GithubEvents({ rootUrl: this.rootUrl });

    const jobBindings = [
      githubEvents.pullRequest(),
      githubEvents.push(),
      githubEvents.release(),
    ];

    const rerunBindings = [
      githubEvents.rerun(),
    ];

    const schedulerId = this.context.cfg.taskcluster.schedulerId;
    const queueEvents = new taskcluster.QueueEvents({ rootUrl: this.rootUrl });

    const statusBindings = [
      queueEvents.taskFailed(`route.${this.context.cfg.app.checkTaskRoute}`),
      queueEvents.taskException(`route.${this.context.cfg.app.checkTaskRoute}`),
      queueEvents.taskCompleted(`route.${this.context.cfg.app.checkTaskRoute}`),
    ];

    // Listen for state changes to the taskcluster tasks and taskgroups
    // We only need to listen for failure and exception events on
    // tasks. We wait for the entire group to be resolved before checking
    // for success.
    const deprecatedResultStatusBindings = [
      queueEvents.taskFailed(`route.${this.context.cfg.app.statusTaskRoute}`),
      queueEvents.taskException(`route.${this.context.cfg.app.statusTaskRoute}`),
      queueEvents.taskGroupResolved({ schedulerId }),
    ];

    // Listen for taskGroupCreationRequested event to create initial status on github
    const deprecatedInitialStatusBindings = [
      githubEvents.taskGroupCreationRequested(`route.${this.context.cfg.app.statusTaskRoute}`),
    ];

    // Listen for taskDefined event to create initial status on github
    const taskBindings = [
      queueEvents.taskDefined(`route.${this.context.cfg.app.checkTaskRoute}`),
    ];

    const callHandler = (name, handler) => message => {
      handler.call(this, message).catch(async err => {
        await this.monitor.reportError(err);
        return err;
      }).then((err = null) => {
        if (this.handlerComplete && !err) {
          this.handlerComplete();
        } else if (this.handlerRejected && err) {
          this.handlerRejected(err);
        }
      });
    };

    this.jobPq = await consume(
      {
        client: this.pulseClient,
        bindings: jobBindings,
        queueName: this.jobQueueName,
      },
      this.monitor.timedHandler('joblistener', callHandler('job', jobHandler).bind(this)),
    );

    this.deprecatedResultStatusPq = await consume(
      {
        client: this.pulseClient,
        bindings: deprecatedResultStatusBindings,
        queueName: this.deprecatedResultStatusQueueName,
      },
      this.monitor.timedHandler('deprecatedStatuslistener', callHandler('status', deprecatedStatusHandler).bind(this)),
    );

    this.deprecatedInitialStatusPq = await consume(
      {
        client: this.pulseClient,
        bindings: deprecatedInitialStatusBindings,
        queueName: this.deprecatedInitialStatusQueueName,
      },
      this.monitor.timedHandler('deprecatedlistener', callHandler('task', taskGroupCreationHandler).bind(this)),
    );

    this.resultStatusPq = await consume(
      {
        client: this.pulseClient,
        bindings: statusBindings,
        queueName: this.resultStatusQueueName,
      },
      this.monitor.timedHandler('statuslistener', callHandler('status', statusHandler).bind(this)),
    );

    this.initialTaskStatusPq = await consume(
      {
        client: this.pulseClient,
        bindings: taskBindings,
        queueName: this.initialStatusQueueName,
      },
      this.monitor.timedHandler('tasklistener', callHandler('task', taskDefinedHandler).bind(this)),
    );

    this.rerunPq = await consume(
      {
        client: this.pulseClient,
        bindings: rerunBindings,
        queueName: this.rerunQueueName,
      },
      this.monitor.timedHandler('rerunlistener', callHandler('rerun', rerunHandler).bind(this)),
    );

  }

  async terminate() {
    if (this.jobPq) {
      await this.jobPq.stop();
    }
    if (this.resultStatusPq) {
      await this.resultStatusPq.stop();
    }
    if (this.initialTaskStatusPq) {
      await this.initialTaskStatusPq.stop();
    }
    if (this.deprecatedResultStatusPq) {
      await this.deprecatedResultStatusPq.stop();
    }
    if (this.deprecatedInitialStatusPq) {
      await this.deprecatedInitialStatusPq.stop();
    }
    if (this.rerunPq) {
      await this.rerunPq.stop();
    }
  }

  // Create a collection of tasks, centralized here to enable testing without creating tasks.
  async createTasks({ scopes, tasks }) {
    const limitedQueueClient = this.queueClient.use({
      authorizedScopes: scopes,
    });
    for (const t of tasks) {
      try {
        await limitedQueueClient.createTask(t.taskId, t.task);
      } catch (err) {
        // translate InsufficientScopes errors nicely for our users, since they are common and
        // since we can provide additional context not available from the queue.
        if (err.code === 'InsufficientScopes') {
          err.message = [
            'Taskcluster-GitHub attempted to create a task for this event with the following scopes:',
            '',
            '```',
            stringify(scopes, null, 2),
            '```',
            '',
            'The expansion of these scopes is not sufficient to create the task, leading to the following:',
            '',
            err.message,
          ].join('\n');
        }
        throw err;
      }
    }
  }

  commentKey(idents) {
    return crypto
      .createHash('md5')
      .update(stringify(idents))
      .digest('hex');
  }

  isDuplicateComment(...idents) {
    return _.indexOf(this.commentHashCache, this.commentKey(idents)) !== -1;
  }

  markCommentSent(...idents) {
    this.commentHashCache.unshift(this.commentKey(idents));
    this.commentHashCache = _.take(this.commentHashCache, 1000);
  }

  // Send an exception to Github in the form of a comment.
  async createExceptionComment({ debug, instGithub, organization, repository, sha, error, pullNumber }) {
    if (this.isDuplicateComment(organization, repository, sha, error, pullNumber)) {
      debug(`exception comment on ${organization}/${repository}#${pullNumber} found to be duplicate. skipping`);
      return;
    }
    let errorBody = error.body && error.body.error || error.message;
    // Let's prettify any objects
    if (typeof errorBody === 'object') {
      errorBody = stringify(errorBody, null, 4);
    }
    let body = [
      '<details>\n',
      '<summary>Uh oh! Looks like an error! Details</summary>',
      '',
      errorBody, // already in Markdown..
      '',
      '</details>',
    ].join('\n') ;

    // Warn the user know that there was a problem handling their request
    // by posting a comment; this error is then considered handled and not
    // reported to the taskcluster team or retried
    if (pullNumber) {
      debug(`creating exception comment on ${organization}/${repository}#${pullNumber}`);
      await instGithub.issues.createComment({
        owner: organization,
        repo: repository,
        issue_number: pullNumber,
        body,
      });
      this.markCommentSent(organization, repository, sha, error, pullNumber);
      return;
    }
    debug(`creating exception comment on ${organization}/${repository}@${sha}`);
    await instGithub.repos.createCommitComment({
      owner: organization,
      repo: repository,
      commit_sha: sha,
      body,
    });
    this.markCommentSent(organization, repository, sha, error, pullNumber);
  }

  /**
   * Function that examines the yml and decides which policy we're using. Defining policy in the yml is not required
   * by the schema, so if it's not defined, the function returns default policy.
   *
   * @param taskclusterYml - parsed YML (JSON object, see docs on `.taskcluster.yml`)
   * @returns policy, a string (either "collaborator" or "public" - available values at the moment)
   */
  getRepoPolicy(taskclusterYml) {
    const DEFAULT_POLICY = POLICIES.COLLABORATORS;

    if (taskclusterYml.version === 0) {
      // consult its `allowPullRequests` field
      return taskclusterYml.allowPullRequests || DEFAULT_POLICY;
    } else if (taskclusterYml.version === 1) {
      if (taskclusterYml.policy) {
        return taskclusterYml.policy.pullRequests || DEFAULT_POLICY;
      }
    }

    return DEFAULT_POLICY;
  }

  /**
   * Try to get `.taskcluster.yml` from a certain ref.
   *
   * @param instGithub - authenticated installation object
   * @param owner - org or a user, a string
   * @param repo - repository, a string
   * @param ref - SHA or branch/tag name, a string
   *
   * @returns either parsed YML if there's a YML and it was parsed successfully,
   * or null if there's no YML,
   * or throws an error in other cases
   */
  async getYml({ instGithub, owner, repo, ref }) {
    let response;
    try {
      response = await instGithub.repos.getContent({ owner, repo, path: '.taskcluster.yml', ref });
    } catch (e) {
      if (e.status === 404) {
        return null;
      }

      if (e.message.endsWith('</body>\n</html>\n') && e.message.length > 10000) {
        // We kept getting full html 500/400 pages from github in the logs.
        // I consider this to be a hard-to-fix bug in octokat, so let's make
        // the logs usable for now and try to fix this later. It's a relatively
        // rare occurence.
        e.message = e.message.slice(0, 100).concat('...');
        e.stack = e.stack.split('</body>\n</html>\n')[1] || e.stack;
      }

      e.owner = owner;
      e.repo = repo;
      e.ref = ref;
      throw e;
    }

    return yaml.load(Buffer.from(response.data.content, 'base64').toString());
  }
}

module.exports = Handlers;
