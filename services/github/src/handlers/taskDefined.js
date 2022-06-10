const { CHECKLOGS_TEXT, CHECKRUN_TEXT } = require('../constants');
const { taskUI, makeDebug, taskLogUI } = require('./utils');

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

module.exports = {
  taskDefinedHandler,
};
