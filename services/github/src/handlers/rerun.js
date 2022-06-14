const { makeDebug } = require('./utils');

/**
 * Github events that request a task rerun.
 *
 * To be able to rerun a task, client will assume `repo:github.com/<owner>/<repo>:rerun` role.
 * This role needs to be defined and should include scopes necessary to call `queue.rerunTask`
 **/
async function rerunHandler(message) {
  const { checkRunId, checkSuiteId, organization, eventId, installationId, details } = message.payload;
  const repo = details['event.head.repo.name'];

  let debug = makeDebug(this.monitor, {
    checkRunId,
    checkSuiteId,
    installationId,
    owner: organization,
    eventId,
    checkName: details['event.check.name'],
    repo,
  });
  debug(JSON.stringify(message.payload));

  // get github build by checkrun/checksuite ids
  const [checkRun] = await this.context.db.fns.get_github_check_by_run_id(checkSuiteId, checkRunId);
  if (!checkRun) {
    debug(`No checkRun found for checkRunId ${checkRunId} and checkSuiteId ${checkSuiteId}`);
    throw new Error(`No checkRun found for checkRunId ${checkRunId} and checkSuiteId ${checkSuiteId}`);
  }

  const { task_group_id: taskGroupId, task_id: taskId } = checkRun;
  debug = debug.refine({ taskGroupId, taskId });

  debug(`Requesting rerun on a taskId ${taskId} / taskGroupId ${taskGroupId}`);

  try {
    const limitedQueueClient = this.queueClient.use({
      authorizedScopes: [`assume:repo:github.com/${organization}/${repo}:rerun`],
    });
    const taskStatus = await limitedQueueClient.rerunTask(taskId);
    debug('Response', { taskStatus });

    // Update commit status? or anything else
    debug(`Updating github build state to pending for taskGroupId ${taskGroupId}`);
    await this.context.db.fns.set_github_build_state(taskGroupId, 'pending');

  } catch (e) {
    e.checkRunId = checkRunId;
    e.checkSuiteId = checkSuiteId;
    e.organization = organization;
    e.repo = repo;
    throw e;
  }
}

module.exports = {
  rerunHandler,
};
