const libUrls = require('taskcluster-lib-urls');

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

module.exports = {
  taskUI,
  taskGroupUI,
  taskLogUI,
  makeDebug,
};
