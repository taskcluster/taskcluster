import utils from '../utils.js';

/**
 * Build the message shown to the repository as a comment when an artifact cannot be fetched.
 */
function artifactErrorMessage(artifactName, err) {
  const requiredScope = `queue:get-artifact:${artifactName}`;
  const prefix = `Failed to fetch task artifact \`${artifactName}\` for GitHub integration.\n`;

  switch (err.code) {
    case 'ArtifactStorageTypeRejected':
      return prefix.concat(
        'The GitHub service does not fetch `reference` artifacts, as their URL is chosen by the ' +
          'task. Publish the content as a stored artifact (storage type `s3` or `object`) instead.'
      );
    case 'ArtifactError':
      return prefix.concat('Make sure the artifact exists on the worker or other location.');
  }

  // Only errors raised by taskcluster api carry 'body' (see client.js)
  // everything else is likely a storage backend, transport failure that can contain
  // signed urls and internal hostnames, so cannot be shown to public
  if (err.body?.message) {
    return err.statusCode === 403
      ? prefix.concat(
          `The GitHub service does not have permission to read this artifact. Make sure the artifact is public or grant the GitHub service the \`${requiredScope}\` scope.`
        )
      : prefix.concat(err.message);
  }

  return prefix.concat('Internal error. The artifact could not be downloaded');
}

/**
 * Helper to request artifacts from statusHandler.
 */
export async function requestArtifact(artifactName, { taskId, runId, debug, instGithub, build }) {
  try {
    return await utils.downloadArtifactAsText({
      queueClient: this.queueClient,
      taskId,
      runId,
      artifactName,
    });
  } catch (err) {
    // a missing artifact just means the task did not publish one
    if (err.statusCode === 404) {
      return '';
    }

    // report error before commenting
    await this.monitor.reportError(err);

    try {
      const { organization, repository, sha } = build;
      await this.createExceptionComment({
        debug,
        instGithub,
        organization,
        repository,
        sha,
        error: new Error(artifactErrorMessage(artifactName, err)),
      });
    } catch (e) {
      await this.monitor.reportError(e);
    }
  }

  return '';
}

export default requestArtifact;
