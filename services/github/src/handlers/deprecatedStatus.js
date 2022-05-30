const { makeDebug, taskGroupUI } = require('./utils');

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

module.exports = {
  deprecatedStatusHandler,
};
