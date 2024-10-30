import path from 'path';
import libUrls from 'taskcluster-lib-urls';
import { CHECK_RUN_STATES } from '../constants.js';

export const taskUI = (rootUrl, taskGroupId, taskId) =>
  libUrls.ui(rootUrl, rootUrl === 'https://taskcluster.net' ? `/groups/${taskGroupId}/tasks/${taskId}/details` : `/tasks/${taskId}`);
export const taskGroupUI = (rootUrl, taskGroupId) =>
  libUrls.ui(rootUrl, `${rootUrl === 'https://taskcluster.net' ? '' : '/tasks'}/groups/${taskGroupId}`);
export const taskLogUI = (rootUrl, runId, taskId, liveLogName = 'public/logs/live.log') =>
  libUrls.ui(rootUrl, path.join(`/tasks/${taskId}/runs/${runId}/logs/live/`, liveLogName));
let debugCounter = 0;

/**
 * Create or refine a debug function with the given attributes.  This eventually calls
 * `monitor.log.handlerDebug`.
 */
export const makeDebug = (monitor, attrs = {}) => {
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

export class GithubCheckOutput {
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

export class GithubCheck {
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

export const isCollaborator = async (instGithub, organization, repository, login) => {
  return Boolean(await instGithub.repos.checkCollaborator({
    owner: organization,
    repo: repository,
    username: login,
    // avoid "default" retry strategy on 404 errors
    request: {
      retries: 1,
      retryAfter: 1,
      doNotRetry: [400, 401, 403],
    },
  }).catch(e => {
    if (e.status !== 404) {
      throw e;
    }
    return false; // 404 -> false
  }));
};

export const getTimeDifference = (timestamp1, timestamp2) => {

  const isValidDate = (date) => {
    return !isNaN(Date.parse(date));
  };

  if (timestamp1 === undefined || timestamp2 === undefined) {
    return null;
  }

  if (!isValidDate(timestamp1) || !isValidDate(timestamp2)) {
    return null;
  }

  const date1 = new Date(timestamp1);
  const date2 = new Date(timestamp2);

  const differenceMs = Math.abs(date2 - date1);

  const ms = differenceMs % 1000;
  const seconds = Math.floor(differenceMs / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  let parts = [];

  if (days > 0) {parts.push(`${days} day${days > 1 ? 's' : ''}`);}
  if (hours % 24 > 0) {parts.push(`${hours % 24} hour${hours % 24 > 1 ? 's' : ''}`);}
  if (minutes % 60 > 0) {parts.push(`${minutes % 60} minute${minutes % 60 > 1 ? 's' : ''}`);}
  if (seconds % 60 > 0) {parts.push(`${seconds % 60} second${seconds % 60 > 1 ? 's' : ''}`);}
  if (ms > 0) {parts.push(`${ms} millisecond${ms > 1 ? 's' : ''}`);}

  const formattedDifference = parts.join(', ');

  return formattedDifference;
};

export const buildUrl = (rootUrl, taskId, runId, artifactName) => {
  return `${rootUrl}/tasks/${taskId}/runs/${runId}/${artifactName}`;
};

export const buildLogUrl = (rootUrl, taskId, runId, artifactName) => {
  return `${rootUrl}/tasks/${taskId}/runs/${runId}/logs/${artifactName}`;
};

export default {
  taskUI,
  taskGroupUI,
  taskLogUI,
  makeDebug,
  GithubCheckOutput,
  GithubCheck,
  isCollaborator,
  getTimeDifference,
  buildUrl,
  buildLogUrl,
};
