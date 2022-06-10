const utils = require('../utils');

/**
 * Helper to request artifacts from statusHandler.
 */
async function requestArtifact(artifactName, { taskId, runId, debug, instGithub, build, scopes }) {
  try {
    const limitedQueueClient = this.queueClient.use({
      authorizedScopes: scopes,
    });
    const url = limitedQueueClient.buildSignedUrl(limitedQueueClient.getArtifact, taskId, runId, artifactName);
    const res = await utils.throttleRequest({ url, method: 'GET' });

    if (res.status >= 400 && res.status !== 404) {
      const requiredScope = `queue:get-artifact:${artifactName}`;
      let errorMessage = `Failed to fetch task artifact \`${artifactName}\` for GitHub integration.\n`;
      switch (res.status) {
        case 403:
          errorMessage = errorMessage.concat(`Make sure your task has the scope \`${requiredScope}\`. See the documentation on the artifact naming.`);
          break;
        case 404:
          errorMessage = errorMessage.concat("Make sure the artifact exists, and there are no typos in its name.");
          break;
        case 424:
          errorMessage = errorMessage.concat("Make sure the artifact exists on the worker or other location.");
          break;
        default:
          if (res.response && res.response.error && res.response.error.message) {
            errorMessage = errorMessage.concat(res.response.error.message);
          }
          break;
      }
      let { organization, repository, sha } = build;
      await this.createExceptionComment({
        debug,
        instGithub,
        organization,
        repository,
        sha,
        error: new Error(errorMessage),
      });

      if (res.status < 500) {
        await this.monitor.reportError(res.response.error);
      }
    } else if (res.status >= 200 && res.status < 300) {
      return res.text.toString();
    }
  } catch (e) {
    await this.monitor.reportError(e);
  }
  return '';
}

module.exports = {
  requestArtifact,
};
