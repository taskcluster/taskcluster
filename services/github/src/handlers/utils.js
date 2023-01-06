const libUrls = require('taskcluster-lib-urls');
const { CHECK_RUN_STATES } = require('../constants');

const taskUI = (rootUrl, taskGroupId, taskId) =>
  libUrls.ui(rootUrl, rootUrl === 'https://taskcluster.net' ? `/groups/${taskGroupId}/tasks/${taskId}/details` : `/tasks/${taskId}`);
const taskGroupUI = (rootUrl, taskGroupId) =>
  libUrls.ui(rootUrl, `${rootUrl === 'https://taskcluster.net' ? '' : '/tasks'}/groups/${taskGroupId}`);
const taskLogUI = (rootUrl, runId, taskId) =>
  libUrls.ui(rootUrl, `/tasks/${taskId}/runs/${runId}/logs/live/public/logs/live.log`);

let debugCounter = 0;

/**
 * Create or refine a debug function with the given attributes.  This eventually calls
 * `monitor.log.handlerDebug`.
 */
const makeDebug = (monitor, attrs = {}) => {
  const debugId = `id-${debugCounter}`;
  debugCounter += 1;
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
    debugId,
  });
  debug.refine = moreAttrs => makeDebug(monitor, { ...attrs, ...moreAttrs, debugId });
  return debug;
};

class GithubCheckOutput {
  constructor({
    title = '',
    summary = '',
    text = '',
    annotations = [],
  }) {
    this.title = title;
    this.summary = summary;
    this.text = text;
    this.annotations = annotations;
  }

  addText(text, appendText = '\n') {
    this.text += `${text}${appendText}`;
  }

  /**
   * Github has a limit of 64Kb for the whole payload
   */
  getRemainingMaxSize() {
    const SAFE_MAX = 60000;
    const used = this.title.length + this.summary.length + this.text.length + JSON.stringify(this.annotations).length;
    return Math.max(0, SAFE_MAX - used);
  }

  getPayload() {
    const { title, summary, text, annotations } = this;

    return {
      title,
      summary,
      text,
      annotations,
    };
  }
}

class GithubCheck {
  constructor({
    // for updates only
    check_run_id = null,
    // base fields
    owner = null,
    repo = null,
    name = null,
    head_sha = null,
    external_id = null,
    details_url = null,

    // task resolution and status
    status = null,
    conclusion = null,

    // output shown in check run details page
    output_title = '',
    output_summary = '',
    output_text = '',
    output_annotations = [],
  }) {
    this.check_run_id = check_run_id;

    this.owner = owner;
    this.repo = repo;
    this.name = name;
    this.head_sha = head_sha;
    this.external_id = external_id;
    this.details_url = details_url;

    this.status = status;
    this.conclusion = conclusion;

    this.output = new GithubCheckOutput({
      title: output_title,
      summary: output_summary,
      text: output_text,
      annotations: output_annotations,
    });
  }

  /**
   * Github check run conclusion and completed_at fields should only be sent
   * when task was completed, otherwise github will
   * automatically resolve check run as completed
   */
  getStatusPayload() {
    const { status, conclusion } = this;
    const resolution = { status };
    if (status === CHECK_RUN_STATES.COMPLETED) {
      resolution.conclusion = conclusion;
      resolution.completed_at = new Date().toISOString();
    }
    return resolution;
  }

  getCreatePayload() {
    const { owner, repo, name, head_sha, external_id, details_url, output } = this;

    return {
      owner,
      repo,
      name,
      head_sha,
      external_id,
      details_url,
      ...this.getStatusPayload(),
      output: output.getPayload(),
    };
  }

  getUpdatePayload() {
    const { owner, repo, check_run_id, output } = this;

    if (!this.check_run_id) {
      throw new Error('Updating check run without check_run_id');
    }

    return {
      check_run_id,
      owner,
      repo,
      ...this.getStatusPayload(),
      output: output.getPayload(),
    };
  }

  getRerequestPayload() {
    const { owner, repo, check_run_id } = this;

    if (!this.check_run_id) {
      throw new Error('Rerequesting check run without check_run_id');
    }

    return {
      check_run_id,
      owner,
      repo,
    };
  }
}

module.exports = {
  taskUI,
  taskGroupUI,
  taskLogUI,
  makeDebug,
  GithubCheckOutput,
  GithubCheck,
};
