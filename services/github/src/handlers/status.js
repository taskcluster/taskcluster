const { CONCLUSIONS, CHECKLOGS_TEXT, CHECKRUN_TEXT, LIVE_BACKING_LOG_ARTIFACT_NAME,
  CUSTOM_CHECKRUN_TEXT_ARTIFACT_NAME, CUSTOM_CHECKRUN_ANNOTATIONS_ARTIFACT_NAME,
  CHECK_RUN_STATES, TASK_STATE_TO_CHECK_RUN_STATE,
} = require('../constants');
const QueueLock = require('../queue-lock');
const { tailLog, markdownLog, markdownAnchor } = require('../utils');
const { requestArtifact } = require('./requestArtifact');
const { taskUI, makeDebug, taskLogUI, GithubCheck } = require('./utils');

/**
 * Tracking events order to prevent older events from overwriting newer updates
 * Rabbitmq messages will be arriving strictly in the order they were created,
 * but the consumer itself doesn't wait for the previous handler to finish,
 * if there is a new message coming in.
 * As handlers are async, and are doing external API calls and db calls,
 * they can spend different amount of time before sending final create/update checkrun.
 * This can lead to situations where newer event is being overwritten by an older one,
 * because it took him longer to reach update calls.
 */
const qLock = new QueueLock({
  maxLockTimeMs: 60 * 1000, // sometimes queue and github calls get delayed
});

/**
 * Post updates to GitHub, when task is being created or its status changes.
 * Uses Checks API
 *
 * @param message exchange message
 *  One of:
 *  taskDefined: https://docs.taskcluster.net/docs/reference/platform/taskcluster-queue/references/events#taskDefined
 *  taskRunning: https://docs.taskcluster.net/docs/reference/platform/taskcluster-queue/references/events#taskRunning
 *  taskCompleted: https://docs.taskcluster.net/docs/reference/platform/taskcluster-queue/references/events#taskCompleted
 *  taskFailed: https://docs.taskcluster.net/docs/reference/platform/taskcluster-queue/references/events#taskFailed
 *  taskException: https://docs.taskcluster.net/docs/reference/platform/taskcluster-queue/references/events#taskException
 * @returns {Promise<void>}
 **/
async function statusHandler(message) {
  const { taskGroupId, state, runs, taskId } = message.payload.status;
  let { runId } = message.payload;
  runId = typeof runId === 'undefined' ? 0 : runId;
  const { reasonResolved } = runs[runId] || {};
  const taskDefined = state === undefined;

  const releaseLock = await qLock.acquire(taskId);

  let debug = makeDebug(this.monitor, { taskGroupId, taskId });
  debug(`Handling state change for task ${taskId} in group ${taskGroupId}, reason=${reasonResolved || state || 'taskDefined'}`, { exchange: message.exchange });

  const conclusion = CONCLUSIONS[reasonResolved || state];
  const checkRunStatus = conclusion ? CHECK_RUN_STATES.COMPLETED : TASK_STATE_TO_CHECK_RUN_STATE[state];

  let [build] = await this.context.db.fns.get_github_build(taskGroupId);
  if (!build) {
    debug(`No github build is associated with task group ${taskGroupId}. Most likely this was triggered by periodic cron hook, which doesn't require github event / check suite.`);
    releaseLock();
    return false;
  }

  const { organization, repository, sha, event_id, event_type, installation_id } = build;
  debug = debug.refine({
    owner: organization,
    repo: repository,
    sha,
    event_id,
    installation_id,
    checkRunStatus,
    conclusion,
  });

  let outputSummary = '';
  let outputTitle = '';

  if (checkRunStatus === CHECK_RUN_STATES.COMPLETED && conclusion === undefined) {
    this.monitor.reportError(new Error(`Unknown reasonResolved or state in ${message.exchange}!
      Resolution reason received: ${reasonResolved}. State received: ${state}. Add these to the handlers map.
      TaskId: ${taskId}, taskGroupId: ${taskGroupId}`),
    );

    outputSummary = `Message came with unknown resolution reason or state.
      Resolution reason received: ${reasonResolved}. State received: ${state}. The status has been marked as neutral.
      For further information, please inspect the task in Taskcluster`;
    outputTitle = 'Unknown Resolution';
  }

  // Authenticating as installation.
  const instGithub = await this.context.github.getInstallationGithub(installation_id);

  debug(
    `Attempting to update status of the checkrun for ${organization}/${repository}@${sha} (${checkRunStatus}:${conclusion})`,
  );

  const createExceptionComment = async (errorMessage) => this.createExceptionComment({
    debug,
    instGithub,
    organization,
    repository,
    sha,
    error: new Error(errorMessage),
  });

  try {
    const taskDefinition = await this.queueClient.task(taskId);
    const fetchArtifact = async (artifactPath) => {
      if (taskDefined || runId === undefined) {
        // when task is being defined, there will be no artifacts, so we fake the call and return empty response
        return null;
      }
      return requestArtifact.call(this, artifactPath, {
        taskId,
        runId,
        debug,
        instGithub,
        build,
        scopes: taskDefinition.scopes,
      });
    };

    const extraCheckRun = taskDefinition?.extra?.github?.customCheckRun;
    const textArtifactName = extraCheckRun?.textArtifactName || CUSTOM_CHECKRUN_TEXT_ARTIFACT_NAME;
    const annotationsArtifactName = extraCheckRun?.annotationsArtifactName || CUSTOM_CHECKRUN_ANNOTATIONS_ARTIFACT_NAME;

    const [ liveLogText, customCheckRunText, customCheckRunAnnotationsText ] = await Promise.all([
      fetchArtifact(LIVE_BACKING_LOG_ARTIFACT_NAME),
      fetchArtifact(textArtifactName),
      fetchArtifact(annotationsArtifactName),
    ]);

    let customCheckRunAnnotations = [];
    if (customCheckRunAnnotationsText) {
      try {
        const json = JSON.parse(customCheckRunAnnotationsText);
        if (Array.isArray(json)) {
          customCheckRunAnnotations = json;
        }
      } catch (e) {
        if (e instanceof SyntaxError) {
          createExceptionComment(
            `Custom annotations artifact ${annotationsArtifactName} on task ${taskId} does not contain valid JSON.`,
          );
        } else {
          await this.monitor.reportError(e);
        }
      }
    }

    const githubCheck = new GithubCheck({
      owner: organization,
      repo: repository,
      name: taskDefinition.metadata.name,
      head_sha: sha,
      external_id: taskId,
      details_url: taskUI(this.context.cfg.taskcluster.rootUrl, taskGroupId, taskId),
      status: checkRunStatus,
      conclusion,

      output_title: outputTitle || `${this.context.cfg.app.statusContext} (${event_type.split('.')[0]})`,
      output_summary: outputSummary || taskDefinition.metadata.description,
      output_annotations: customCheckRunAnnotations,
    });
    const output = githubCheck.output;
    output.addText(markdownAnchor(CHECKRUN_TEXT, taskUI(this.context.cfg.taskcluster.rootUrl, taskGroupId, taskId)));
    output.addText(markdownAnchor(CHECKLOGS_TEXT, taskLogUI(this.context.cfg.taskcluster.rootUrl, runId, taskId)));
    if (customCheckRunText) {
      output.addText(customCheckRunText);
    }
    if (liveLogText) {
      output.addText(markdownLog(tailLog(liveLogText, 250, githubCheck.output.getRemainingMaxSize())));
    }

    let [checkRun] = await this.context.db.fns.get_github_check_by_task_id(taskId);
    const isRerun = checkRunStatus === CHECK_RUN_STATES.IN_PROGRESS && runId > 0;

    if (checkRun && !isRerun) {
      githubCheck.check_run_id = checkRun.check_run_id;
      debug(`Updating check run ${checkRun.check_run_id} for task ${taskId}`, { payload: JSON.stringify(githubCheck.getUpdatePayload()) });
      await instGithub.checks.update(githubCheck.getUpdatePayload());
    } else {
      if (isRerun) {
        debug(`Forcing creation of new check run for task ${taskId} and runId ${runId}`);
      }
      debug(`Creating check run for task ${taskId}`, { payload: JSON.stringify(githubCheck.getCreatePayload()) });
      checkRun = await instGithub.checks.create(githubCheck.getCreatePayload());
      await this.context.db.fns.create_github_check(
        taskGroupId,
        taskId,
        checkRun.data.check_suite.id.toString(),
        checkRun.data.id.toString(),
      );
      debug(`Created check run ${checkRun.data.id} for task ${taskId}`);
    }
  } catch (e) {
    await createExceptionComment(e);
    e.owner = build.organization;
    e.repo = build.repository;
    e.sha = build.sha;
    throw e;
  } finally {
    releaseLock();
  }
}

module.exports = {
  statusHandler,
};
