const { makeDebug, taskGroupUI } = require('./utils');

/**
 * Post updates to GitHub, when the status of a task changes. Uses Statuses API
 * Taskcluster States: https://docs.taskcluster.net/docs/reference/platform/queue/exchanges
 * GitHub Statuses: https://developer.github.com/v3/repos/statuses/
 **/
async function deprecatedStatusHandler(message) {
  let taskGroupId = message.payload.taskGroupId || message.payload.status.taskGroupId;

  let debug = makeDebug(this.monitor, { taskGroupId });
  debug(`Statuses API. Handling state change for task-group ${taskGroupId}`);

  let [build] = await this.context.db.fns.get_github_build_pr(taskGroupId);
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

  const { exchangeNames } = this;

  let state = 'success';
  let usesChecks = false;

  if (message.exchange === exchangeNames.taskGroupResolved) {
    // if this task group uses checks api, there is no need to go through all tasks
    const [checks] = await this.context.db.fns.get_github_checks_by_task_group_id(1, 0, taskGroupId);
    if (checks) {
      usesChecks = true;
    }

    let params = {};
    do {
      let group = await this.queueClient.listTaskGroup(message.payload.taskGroupId, params);
      params.continuationToken = group.continuationToken;

      for (let i = 0; i < group.tasks.length; i++) {
        if (['failed', 'exception'].includes(group.tasks[i].status.state)) {
          state = 'failure';
          break; // one failure is enough
        }
      }
    } while (params.continuationToken && state === 'success');
  } else if ([exchangeNames.taskException, exchangeNames.taskFailed].includes(message.exchange)) {
    state = 'failure';
  } else if ([exchangeNames.taskRunning, exchangeNames.taskPending].includes(message.exchange)) {
    // if build is not pending, it means it was already resolved as success or failure
    // seeing a running task means it was retried, so we should set the status back to pending
    if (build.state !== 'pending') {
      state = 'pending';
    } else {
      // no need to update state at this point, as we need the final status
      debug(`Not updating status for ${taskGroupId} as it is still pending`);
      return;
    }
  } else {
    // this shouldn't happen .. but just in case
    debug(`Cannot determine state from message exchange: ${message.exchange}`);
    return;
  }

  // It is worth noting that we always want to change the state of the build in the database.
  // Although this handler is marked as deprecated, taskGroupResolved event should be handled in one place
  await this.context.db.fns.set_github_build_state(taskGroupId, state);

  if (usesChecks) {
    debug(`Create commit status not called: Task group ${taskGroupId} uses Checks API. Exiting`);
    return;
  }

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

module.exports = {
  deprecatedStatusHandler,
};
