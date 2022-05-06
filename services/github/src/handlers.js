const _ = require('lodash');
const stringify = require('fast-json-stable-stringify');
const crypto = require('crypto');
const taskcluster = require('taskcluster-client');
const libUrls = require('taskcluster-lib-urls');
const yaml = require('js-yaml');
const assert = require('assert');
const { consume } = require('taskcluster-lib-pulse');
const { UNIQUE_VIOLATION } = require('taskcluster-lib-postgres');
const { CONCLUSIONS, CHECKLOGS_TEXT, CHECKRUN_TEXT, CUSTOM_CHECKRUN_TEXT_ARTIFACT_NAME, CUSTOM_CHECKRUN_ANNOTATIONS_ARTIFACT_NAME } = require('./constants');
const utils = require('./utils');

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
    const DEFAULT_POLICY = 'collaborators';

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

const taskUI = (rootUrl, taskGroupId, taskId) =>
  libUrls.ui(rootUrl, rootUrl === 'https://taskcluster.net' ? `/groups/${taskGroupId}/tasks/${taskId}/details` : `/tasks/${taskId}`);
const taskGroupUI = (rootUrl, taskGroupId) =>
  libUrls.ui(rootUrl, `${rootUrl === 'https://taskcluster.net' ? '' : '/tasks'}/groups/${taskGroupId}`);
const taskLogUI = (rootUrl, runId, taskId) =>
  libUrls.ui(rootUrl, `/tasks/${taskId}/runs/${runId}/logs/public/logs/live.log`);

/**
 * Create or refine a debug function with the given attributes.  This eventually calls
 * `monitor.log.handlerDebug`.
 */
const makeDebug = (monitor, attrs = {}) => {
  const debug = message => monitor.log.handlerDebug({
    eventId: null,
    installationId: null,
    taskGroupId: null,
    taskId: null,
    owner: null,
    repo: null,
    sha: null,
    ...attrs,
    message,
  });
  debug.refine = moreAttrs => makeDebug(monitor, { ...attrs, ...moreAttrs });
  return debug;
};

/**
 * Post updates to GitHub, when the status of a task changes. Uses Statuses API
 * Taskcluster States: https://docs.taskcluster.net/reference/platform/queue/references/events
 * GitHub Statuses: https://developer.github.com/v3/repos/statuses/
 **/
async function deprecatedStatusHandler(message) {
  let taskGroupId = message.payload.taskGroupId || message.payload.status.taskGroupId;

  let debug = makeDebug(this.monitor, { taskGroupId });
  debug(`Statuses API. Handling state change for task-group ${taskGroupId}`);

  let [build] = await this.context.db.fns.get_github_build(taskGroupId);
  if (!build) {
    debug('no status to update..');
    return;
  }

  debug = debug.refine({
    owner: build.organization,
    repo: build.repository,
    sha: build.sha,
    installationId: build.installation_id,
  });

  let state = 'success';

  if (message.exchange.endsWith('task-group-resolved')) {
    let params = {};
    do {
      let group = await this.queueClient.listTaskGroup(message.payload.taskGroupId, params);
      params.continuationToken = group.continuationToken;

      for (let i = 0; i < group.tasks.length; i++) {
        // don't post group status for checks API
        if (group.tasks[i].task.routes.includes(this.context.cfg.app.checkTaskRoute)) {
          debug(`Task group result status not updated: Task group ${taskGroupId} uses Checks API. Exiting`);
          return;
        }

        if (['failed', 'exception'].includes(group.tasks[i].status.state)) {
          state = 'failure';
          break; // one failure is enough
        }
      }
    } while (params.continuationToken && state === 'success');
  }

  if (message.exchange.endsWith('task-exception') || message.exchange.endsWith('task-failed')) {
    state = 'failure';
  }

  await this.context.db.fns.set_github_build_state(taskGroupId, state);

  // Authenticating as installation.
  let instGithub = await this.context.github.getInstallationGithub(build.installation_id);

  debug(`Attempting to update status for ${build.organization}/${build.repository}@${build.sha} (${state})`);
  const target_url = taskGroupUI(this.context.cfg.taskcluster.rootUrl, taskGroupId);
  try {
    await instGithub.repos.createCommitStatus({
      owner: build.organization,
      repo: build.repository,
      sha: build.sha,
      state,
      target_url,
      description: 'TaskGroup: ' + state,
      context: `${this.context.cfg.app.statusContext} (${build.event_type.split('.')[0]})`,
    });
  } catch (e) {
    e.owner = build.organization;
    e.repo = build.repository;
    e.sha = build.sha;
    throw e;
  }
}

/**
 * Helper to request artifacts from statusHandler.
 */
async function requestArtifact(artifactName, { taskId, runId, debug, instGithub, build, scopes }) {
  try {
    const limitedQueueClient = this.queueClient.use({
      authorizedScopes: scopes,
    });
    const url = limitedQueueClient.buildSignedUrl(limitedQueueClient.getArtifact, taskId, runId, artifactName);
    const res = await utils.throttleRequest({ url, method: 'GET' });

    if (res.status >= 400 && res.status !== 404) {
      const requiredScope = `queue:get-artifact:${artifactName}`;
      let errorMessage = `Failed to fetch task artifact \`${artifactName}\` for GitHub integration.\n`;
      switch (res.status) {
        case 403:
          errorMessage = errorMessage.concat(`Make sure your task has the scope \`${requiredScope}\`. See the documentation on the artifact naming.`);
          break;
        case 404:
          errorMessage = errorMessage.concat("Make sure the artifact exists, and there are no typos in its name.");
          break;
        case 424:
          errorMessage = errorMessage.concat("Make sure the artifact exists on the worker or other location.");
          break;
        default:
          if (res.response && res.response.error && res.response.error.message) {
            errorMessage = errorMessage.concat(res.response.error.message);
          }
          break;
      }
      let { organization, repository, sha } = build;
      await this.createExceptionComment({
        debug,
        instGithub,
        organization,
        repository,
        sha,
        error: new Error(errorMessage),
      });

      if (res.status < 500) {
        await this.monitor.reportError(res.response.error);
      }
    } else if (res.status >= 200 && res.status < 300) {
      return res.text.toString();
    }
  } catch (e) {
    await this.monitor.reportError(e);
  }
  return '';
}

/**
 * Post updates to GitHub, when the status of a task changes. Uses Checks API
 **/
async function statusHandler(message) {
  let { taskGroupId, state, runs, taskId } = message.payload.status;
  let { runId } = message.payload;
  let { reasonResolved } = runs[runId];

  let debug = makeDebug(this.monitor, { taskGroupId, taskId });
  debug(`Handling state change for task ${taskId} in group ${taskGroupId}`);

  let conclusion = CONCLUSIONS[reasonResolved || state];

  let [build] = await this.context.db.fns.get_github_build(taskGroupId);

  let { organization, repository, sha, event_id, event_type, installation_id } = build;

  debug = debug.refine({
    owner: organization,
    repo: repository,
    sha,
    event_id,
    installation_id,
  });

  let taskState = {
    status: 'completed',
    conclusion: conclusion || 'neutral',
    completed_at: new Date().toISOString(),
  };

  if (conclusion === undefined) {
    this.monitor.reportError(new Error(`Unknown reasonResolved or state in ${message.exchange}!
      Resolution reason received: ${reasonResolved}. State received: ${state}. Add these to the handlers map.
      TaskId: ${taskId}, taskGroupId: ${taskGroupId}`),
    );

    taskState.output = {
      summary: `Message came with unknown resolution reason or state.
        Resolution reason received: ${reasonResolved}. State received: ${state}. The status has been marked as neutral.
        For further information, please inspect the task in Taskcluster`,
      title: 'Unknown Resolution',
    };
  }

  // Authenticating as installation.
  let instGithub = await this.context.github.getInstallationGithub(installation_id);

  debug(
    `Attempting to update status of the checkrun for ${organization}/${repository}@${sha} (${taskState.conclusion})`,
  );
  try {
    const taskDefinition = await this.queueClient.task(taskId);

    let textArtifactName = CUSTOM_CHECKRUN_TEXT_ARTIFACT_NAME;
    if (taskDefinition.extra && taskDefinition.extra.github && taskDefinition.extra.github.customCheckRun) {
      textArtifactName =
        taskDefinition.extra.github.customCheckRun.textArtifactName || CUSTOM_CHECKRUN_TEXT_ARTIFACT_NAME;
    }

    let annotationsArtifactName = CUSTOM_CHECKRUN_ANNOTATIONS_ARTIFACT_NAME;
    if (taskDefinition.extra && taskDefinition.extra.github && taskDefinition.extra.github.customCheckRun) {
      annotationsArtifactName =
        taskDefinition.extra.github.customCheckRun.annotationsArtifactName || CUSTOM_CHECKRUN_ANNOTATIONS_ARTIFACT_NAME;
    }

    const customCheckRunText = await requestArtifact.call(this, textArtifactName, {
      taskId,
      runId,
      debug,
      instGithub,
      build,
      scopes: taskDefinition.scopes,
    });

    let customCheckRunAnnotations = [];
    const customCheckRunAnnotationsText = await requestArtifact.call(this, annotationsArtifactName, {
      taskId,
      runId,
      debug,
      instGithub,
      build,
      scopes: taskDefinition.scopes,
    });
    if (customCheckRunAnnotationsText) {
      try {
        const json = JSON.parse(customCheckRunAnnotationsText);
        if (Array.isArray(json)) {
          customCheckRunAnnotations = json;
        }
      } catch (e) {
        if (e instanceof SyntaxError) {
          let errorMessage = `Custom annotations artifact ${annotationsArtifactName} on task ${taskId} does not contain valid JSON.`;
          await this.createExceptionComment({
            debug,
            instGithub,
            organization,
            repository,
            sha,
            error: new Error(errorMessage),
          });
        }
        else{
          await this.monitor.reportError(e);
        }
      }
    }

    let [checkRun] = await this.context.db.fns.get_github_check_by_task_id(taskId);
    if (checkRun) {
      await instGithub.checks.update({
        ...taskState,
        owner: organization,
        repo: repository,
        check_run_id: checkRun.check_run_id,
        output: {
          title: `${this.context.cfg.app.statusContext} (${event_type.split('.')[0]})`,
          summary: `${taskDefinition.metadata.description}`,
          text: `[${CHECKRUN_TEXT}](${taskUI(this.context.cfg.taskcluster.rootUrl, taskGroupId, taskId)})\n[${CHECKLOGS_TEXT}](${taskLogUI(this.context.cfg.taskcluster.rootUrl, runId, taskId)})\n${customCheckRunText || ''}`,
          annotations: customCheckRunAnnotations,
        },
      });
    } else {
      const checkRun = await instGithub.checks.create({
        ...taskState,
        owner: organization,
        repo: repository,
        name: `${taskDefinition.metadata.name}`,
        head_sha: sha,
        output: {
          title: `${this.context.cfg.app.statusContext} (${event_type.split('.')[0]})`,
          summary: `${taskDefinition.metadata.description}`,
          text: `[${CHECKRUN_TEXT}](${taskUI(this.context.cfg.taskcluster.rootUrl, taskGroupId, taskId)})\n[${CHECKLOGS_TEXT}](${taskLogUI(this.context.cfg.taskcluster.rootUrl, runId, taskId)})\n${customCheckRunText || ''}`,
          annotations: customCheckRunAnnotations,
        },
        details_url: taskUI(this.context.cfg.taskcluster.rootUrl, taskGroupId, taskId),
      });

      await this.context.db.fns.create_github_check(
        taskGroupId,
        taskId,
        checkRun.data.check_suite.id.toString(),
        checkRun.data.id.toString(),
      );
    }
  } catch (e) {
    e.owner = build.organization;
    e.repo = build.repository;
    e.sha = build.sha;
    throw e;
  }
}

/**
 * If a .taskcluster.yml exists, attempt to turn it into a taskcluster
 * graph config, and post the initial status on github.
 **/
async function jobHandler(message) {
  const { eventId, installationId } = message.payload;
  let debug = makeDebug(this.monitor, { eventId, installationId });

  let context = this.context;

  // Authenticating as installation.
  let instGithub = await context.github.getInstallationGithub(installationId);

  // We must attempt to convert the sanitized fields back to normal here.
  // Further discussion of how to deal with this cleanly is in
  // https://github.com/taskcluster/taskcluster-github/issues/52
  message.payload.organization = message.payload.organization.replace(/%/g, '.');
  message.payload.repository = message.payload.repository.replace(/%/g, '.');
  let organization = message.payload.organization;
  let repository = message.payload.repository;
  let sha = message.payload.details['event.head.sha'];
  debug = debug.refine({ owner: organization, repo: repository, sha });
  let pullNumber = message.payload.details['event.pullNumber'];

  if (!sha) {
    // only releases lack event.head.sha
    if (message.payload.details['event.type'] !== 'release') {
      debug(`Ignoring ${message.payload.details['event.type']} event with no sha`);
      return;
    }

    debug('Trying to get release commit info in job handler...');
    let commitInfo = await instGithub.repos.getCommit({
      headers: { accept: 'application/vnd.github.3.sha' },
      owner: organization,
      repo: repository,
      // fetch the target_commitish for the release, as the tag may not
      // yet have been created
      ref: message.payload.body.release.target_commitish,
    });
    sha = commitInfo.data;
  }

  debug(`handling ${message.payload.details['event.type']} webhook for: ${organization}/${repository}@${sha}`);

  // Try to fetch a .taskcluster.yml file for every request
  debug(`Trying to fetch the YML for ${organization}/${repository}@${sha}`);
  let repoconf;
  try {
    repoconf = await this.getYml({ instGithub, owner: organization, repo: repository, ref: sha });
  } catch (e) {
    if (e.name === 'YAMLException') {
      return await this.createExceptionComment({
        debug,
        instGithub,
        organization,
        repository,
        sha,
        error: e,
        pullNumber,
      });
    }
    throw e;
  }
  if (!repoconf) {
    debug(`${organization}/${repository} has no '.taskcluster.yml' at ${sha}. Skipping.`);
    return;
  }

  let groupState = 'pending';
  let taskGroupId = 'nonexistent';
  let graphConfig;

  // Now we can try processing the config and kicking off a task.
  try {
    graphConfig = this.intree({
      config: repoconf,
      payload: message.payload,
      validator: context.validator,
      schema: {
        0: libUrls.schema(this.rootUrl, 'github', 'v1/taskcluster-github-config.yml'),
        1: libUrls.schema(this.rootUrl, 'github', 'v1/taskcluster-github-config.v1.yml'),
      },
    });
    if (graphConfig.tasks !== undefined && !Array.isArray(graphConfig.tasks)) {
      throw new Error('tasks field  of .taskcluster.yml must be array of tasks or empty array');
    }
    if (!graphConfig.tasks || graphConfig.tasks.length === 0) {
      debug(`intree config for ${organization}/${repository}@${sha} compiled with zero tasks. Skipping.`);
      return;
    }
  } catch (e) {
    debug(`.taskcluster.yml for ${organization}/${repository}@${sha} was not formatted correctly.
      Leaving comment on Github.`);
    await this.createExceptionComment({ debug, instGithub, organization, repository, sha, error: e, pullNumber });
    return;
  }

  // Checking pull request permission.
  if (message.payload.details['event.type'].startsWith('pull_request.')) {
    debug(`Checking pull request permission for ${organization}/${repository}@${sha}...`);

    debug(`Retrieving  ${organization}/${repository}@${sha}...`);
    let defaultBranch = (await instGithub.repos.get({ owner: organization, repo: repository }))
      .data
      .default_branch;

    let defaultBranchYml = await this.getYml({ instGithub, owner: organization, repo: repository, ref: defaultBranch });

    if (!defaultBranchYml) {
      debug(`${organization}/${repository} has no '.taskcluster.yml' at ${defaultBranch}.`);

      // If the repository does not contain a '.taskcluster.yml' file, collaborators should be able to test before
      // initializing.
      defaultBranchYml = { version: 1, policy: { pullRequests: 'collaborators_quiet' } };
    }

    if (this.getRepoPolicy(defaultBranchYml).startsWith('collaborators')) {
      // There are four usernames associated with a PR action:
      //  - pull_request.user.login -- the user who opened the PR
      //  - pull_request.head.user.login -- the username or org name for the repo from which changes are pulled
      //  - pull_request.base.user.login -- the username or org name for the repo into which changes will merge
      //  - sender.login -- the user who clicked the button to trigger this action
      //
      // The "collaborators" and "collaborators_quiet" policies require:
      //  - pull_request.user.login is a collaborator; AND
      //  - pull_request.head.user.login is
      //    - a collaborator OR
      //    - the same as pull_request.base.user.login
      //
      // Meaning that the PR must have been opened by a collaborator and be merging code from a collaborator
      // or from the repo against which the PR is filed.

      const isCollaborator = async login => {
        return Boolean(await instGithub.repos.checkCollaborator({
          owner: organization,
          repo: repository,
          username: login,
        }).catch(e => {
          if (e.status !== 404) {
            throw e;
          }
          return false; // 404 -> false
        }));
      };

      const evt = message.payload.body;
      const opener = evt.pull_request.user.login;
      const openerIsCollaborator = await isCollaborator(opener);
      const head = evt.pull_request.head.user.login;
      const headIsCollaborator = head === opener ? openerIsCollaborator : await isCollaborator(head);
      const headIsBase = evt.pull_request.head.user.login === evt.pull_request.base.user.login;

      if (!(openerIsCollaborator && (headIsCollaborator || headIsBase))) {
        if (message.payload.details['event.type'].startsWith('pull_request.opened') && (this.getRepoPolicy(defaultBranchYml) !== 'collaborators_quiet')) {
          let body = [
            '<details>\n',
            '<summary>No Taskcluster jobs started for this pull request</summary>\n\n',
            '```js\n',
            'The `allowPullRequests` configuration for this repository (in `.taskcluster.yml` on the',
            'default branch) does not allow starting tasks for this pull request.',
            '```\n',
            '</details>',
          ].join('\n');
          await instGithub.issues.createComment({
            owner: organization,
            repo: repository,
            issue_number: pullNumber,
            body,
          });
        }

        debug(`This user is not collaborator on ${organization}/${repository} and can't make PR@${sha}. Exiting...`);
        return;
      }
    }
  }

  let routes;
  try {
    taskGroupId = graphConfig.tasks[0].task.taskGroupId;
    routes = graphConfig.tasks[0].task.routes;
  } catch (e) {
    return await this.createExceptionComment({ debug, instGithub, organization, repository, sha, error: e });
  }

  try {
    debug(`Trying to create a record for ${organization}/${repository}@${sha} (${groupState}) in github_builds table`);
    let now = new Date();
    await context.db.fns.create_github_build(
      organization,
      repository,
      sha,
      taskGroupId,
      groupState,
      now,
      now,
      message.payload.installationId,
      message.payload.details['event.type'],
      message.payload.eventId,
    );
  } catch (err) {
    if (err.code !== UNIQUE_VIOLATION) {
      throw err;
    }
    const [build] = await this.context.db.fns.get_github_build(taskGroupId);
    assert.equal(build.state, groupState, `State for ${organization}/${repository}@${sha}
      already exists but is set to ${build.state} instead of ${groupState}!`);
    assert.equal(build.organization, organization);
    assert.equal(build.repository, repository);
    assert.equal(build.sha, sha);
    assert.equal(build.eventType, message.payload.details['event.type']);
    assert.equal(build.eventId, message.payload.eventId);
  }

  try {
    debug(`Creating tasks for ${organization}/${repository}@${sha} (taskGroupId: ${taskGroupId})`);
    await this.createTasks({ scopes: graphConfig.scopes, tasks: graphConfig.tasks });
  } catch (e) {
    debug(`Creating tasks for ${organization}/${repository}@${sha} failed! Leaving comment on Github.`);
    return await this.createExceptionComment({ debug, instGithub, organization, repository, sha, error: e });
  }

  try {
    debug(`Publishing status exchange for ${organization}/${repository}@${sha} (${groupState})`);
    await context.publisher.taskGroupCreationRequested({
      taskGroupId,
      organization: organization.replace(/\./g, '%'),
      repository: repository.replace(/\./g, '%'),
    }, routes);
  } catch (e) {
    debug(`Failed to publish to taskGroupCreationRequested exchange.
    Parameters: ${taskGroupId}, ${organization}, ${repository}, ${routes}`);
    debug(`Stack: ${e.stack}`);
    return debug(`Failed to publish to taskGroupCreationRequested exchange
    for ${organization}/${repository}@${sha} with the error: ${stringify(e, null, 2)}`);
  }

  debug(`Job handling for ${organization}/${repository}@${sha} completed.`);
}

/**
 * When the task group was defined, post the initial status to github
 * statuses api function.  This handler responds to a message sent by the
 * jobHandler.
 *
 * @param message - taskGroupCreationRequested exchange message
 *   this repo/schemas/task-group-creation-requested.yml
 * @returns {Promise<void>}
 */
async function taskGroupCreationHandler(message) {
  const {
    taskGroupId,
  } = message.payload;

  let debug = makeDebug(this.monitor, { taskGroupId });
  debug(`Task group ${taskGroupId} was defined. Creating group status...`);

  const [{
    sha,
    event_type,
    event_id,
    installation_id,
    organization,
    repository,
  }] = await this.context.db.fns.get_github_build(taskGroupId);
  debug = debug.refine({ event_id, sha, owner: organization, repo: repository, installation_id });

  const statusContext = `${this.context.cfg.app.statusContext} (${event_type.split('.')[0]})`;
  const description = `TaskGroup: Pending (for ${event_type})`;
  const target_url = taskGroupUI(this.context.cfg.taskcluster.rootUrl, taskGroupId);

  // Authenticating as installation.
  const instGithub = await this.context.github.getInstallationGithub(installation_id);

  debug('Creating new "pending" status');
  await instGithub.repos.createCommitStatus({
    owner: organization,
    repo: repository,
    sha,
    state: 'pending',
    target_url,
    description,
    context: statusContext,
  });
}

/**
 * When the task was defined, post the initial status to github
 * checks api function
 *
 * @param message - taskDefined exchange message
 *   https://docs.taskcluster.net/docs/reference/platform/taskcluster-queue/references/events#taskDefined
 * @returns {Promise<void>}
 */
async function taskDefinedHandler(message) {
  const { taskGroupId, taskId } = message.payload.status;

  let debug = makeDebug(this.monitor, { taskGroupId, taskId });
  debug(`Task was defined for task group ${taskGroupId}. Creating status for task ${taskId}...`);

  const [{
    sha,
    event_type,
    event_id,
    installation_id,
    organization,
    repository,
  }] = await this.context.db.fns.get_github_build(taskGroupId);
  debug = debug.refine({ owner: organization, repo: repository, sha, installation_id, event_id });

  const taskDefinition = await this.queueClient.task(taskId);
  debug(`Initial status. Got task build from DB and task definition for ${taskId} from Queue service`);

  // Authenticating as installation.
  const instGithub = await this.context.github.getInstallationGithub(installation_id);
  debug(`Authenticated as installation. Creating check run for task ${taskId}, task group ${taskGroupId}`);

  let [checkRun] = await this.context.db.fns.get_github_check_by_task_id(taskId);
  if (!checkRun) {
    const checkRun = await instGithub.checks.create({
      owner: organization,
      repo: repository,
      name: `${taskDefinition.metadata.name}`,
      head_sha: sha,
      output: {
        title: `${this.context.cfg.app.statusContext} (${event_type.split('.')[0]})`,
        summary: `${taskDefinition.metadata.description}`,
        text: `[${CHECKRUN_TEXT}](${taskUI(this.context.cfg.taskcluster.rootUrl, taskGroupId, taskId)})\n[${CHECKLOGS_TEXT}](${taskLogUI(this.context.cfg.taskcluster.rootUrl, 0, taskId)})\n`,
      },
      details_url: taskUI(this.context.cfg.taskcluster.rootUrl, taskGroupId, taskId),
    }).catch(async (err) => {
      await this.createExceptionComment({ debug, instGithub, organization, repository, sha, error: err });
      throw err;
    });

    debug(`Created check run for task ${taskId}, task group ${taskGroupId}. Now updating data base`);

    await this.context.db.fns.create_github_check(
      taskGroupId,
      taskId,
      checkRun.data.check_suite.id.toString(),
      checkRun.data.id.toString(),
    ).catch(async (err) => {
      await this.createExceptionComment({ debug, instGithub, organization, repository, sha, error: err });
      throw err;
    });

    debug(`Status for task ${taskId}, task group ${taskGroupId} created`);
  } else {
    debug('Check already created by status handler so we skip updating here.');
  }
}
