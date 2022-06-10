const { makeDebug, taskGroupUI } = require('./utils');

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

module.exports = {
  taskGroupCreationHandler,
};
