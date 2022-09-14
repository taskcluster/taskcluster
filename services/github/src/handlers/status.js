const { CONCLUSIONS, CHECKLOGS_TEXT, CHECKRUN_TEXT, LIVE_LOG_ARTIFACT_NAME, CUSTOM_CHECKRUN_TEXT_ARTIFACT_NAME, CUSTOM_CHECKRUN_ANNOTATIONS_ARTIFACT_NAME, CHECK_RUN_STATES, TASK_STATE_TO_CHECK_RUN_STATE } = require('../constants');
const { tailLog } = require('../utils');
const { requestArtifact } = require('./requestArtifact');
const { taskUI, makeDebug, taskLogUI } = require('./utils');

/**
 * Post updates to GitHub, when the status of a task changes. Uses Checks API
 **/
async function statusHandler(message) {
  let { taskGroupId, state, runs, taskId } = message.payload.status;
  let { runId } = message.payload;
  let { reasonResolved } = runs[runId];

  let debug = makeDebug(this.monitor, { taskGroupId, taskId });
  debug(`Handling state change for task ${taskId} in group ${taskGroupId}, reason=${reasonResolved || state}`);

  const checkRunStatus = TASK_STATE_TO_CHECK_RUN_STATE[state] || CHECK_RUN_STATES.COMPLETED;
  let conclusion = CONCLUSIONS[reasonResolved || state];

  let [build] = await this.context.db.fns.get_github_build(taskGroupId);
  if (!build) {
    debug(`No github build is associated with task group ${taskGroupId}. Most likely this was triggered by periodic cron hook, which doesn't require github event / check suite.`);
    return false;
  }

  let { organization, repository, sha, event_id, event_type, installation_id } = build;

  debug = debug.refine({
    owner: organization,
    repo: repository,
    sha,
    event_id,
    installation_id,
    checkRunStatus,
    conclusion,
  });

  let taskState = {
    status: checkRunStatus,
    conclusion: conclusion || 'neutral',
    completed_at: new Date().toISOString(),
  };

  if (checkRunStatus !== CHECK_RUN_STATES.COMPLETED) {
    // non-completed checks should not include conclusion, as github will automatically resolve task as completed
    delete taskState.conclusion;
    delete taskState.completed_at;
  } else if (conclusion === undefined) {
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
  const instGithub = await this.context.github.getInstallationGithub(installation_id);

  debug(
    `Attempting to update status of the checkrun for ${organization}/${repository}@${sha} (${taskState.status}:${taskState.conclusion})`,
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

    const liveLogText = await requestArtifact.call(this, LIVE_LOG_ARTIFACT_NAME, {
      taskId,
      runId,
      debug,
      instGithub,
      build,
      scopes: taskDefinition.scopes,
    });

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
        else {
          await this.monitor.reportError(e);
        }
      }
    }

    const output = {
      title: `${this.context.cfg.app.statusContext} (${event_type.split('.')[0]})`,
      summary: `${taskDefinition.metadata.description}`,
      text: [
        `[${CHECKRUN_TEXT}](${taskUI(this.context.cfg.taskcluster.rootUrl, taskGroupId, taskId)})`,
        `[${CHECKLOGS_TEXT}](${taskLogUI(this.context.cfg.taskcluster.rootUrl, runId, taskId)})`,
        liveLogText ? `\n\`\`\`bash\n${tailLog(liveLogText)}\n\`\`\`` : '', // tails the last 250 lines of the log
        customCheckRunText || '',
      ].join('\n'),
      annotations: customCheckRunAnnotations,
    };

    let [checkRun] = await this.context.db.fns.get_github_check_by_task_id(taskId);

    if (checkRun) {
      if (checkRunStatus === CHECK_RUN_STATES.IN_PROGRESS && runId > 0) {
        // If check run was previously completed, it is not possible to change state by updating check run
        // instead, we should call `rerequestRun` for a given check run
        // This will reset status, and trigger `rerequested` event, which will be ignored, as it was triggered by us
        debug(`Existing check run ${checkRun.check_run_id} for task ${taskId} was already completed. Requesting rerun`);
        await instGithub.checks.rerequestRun({
          check_run_id: checkRun.check_run_id,
          repo: repository,
          owner: organization,
        });
      }

      debug(`Updated check run ${checkRun.check_run_id} for task ${taskId}`);
      await instGithub.checks.update({
        ...taskState,
        owner: organization,
        repo: repository,
        check_run_id: checkRun.check_run_id,
        output,
      });
    } else {
      checkRun = await instGithub.checks.create({
        ...taskState,
        owner: organization,
        repo: repository,
        name: `${taskDefinition.metadata.name}`,
        head_sha: sha,
        external_id: taskId,
        output,
        details_url: taskUI(this.context.cfg.taskcluster.rootUrl, taskGroupId, taskId),
      });

      await this.context.db.fns.create_github_check(
        taskGroupId,
        taskId,
        checkRun.data.check_suite.id.toString(),
        checkRun.data.id.toString(),
      );
      debug(`Created check run ${checkRun.data.id} for task ${taskId}`);
    }
  } catch (e) {
    e.owner = build.organization;
    e.repo = build.repository;
    e.sha = build.sha;
    throw e;
  }
}

module.exports = {
  statusHandler,
};
