const { Queue, Index } = require('taskcluster-client-web');

function getClient({ Class, user }) {
  if (user) {
    return new Class({
      rootUrl: window.env.TASKCLUSTER_ROOT_URL,
      credentials: user.credentials,
    });
  }

  return new Class({ rootUrl: window.env.TASKCLUSTER_ROOT_URL });
}

/**
 * Get a signed URL that can be used to fetch the given task.  This URL is
 * time-limited and should be used immediately.  If there is no current user,
 * then the URL is not signed.  Calling components should use `withAuth` to get
 * `props.user`.
 */
export function getArtifactUrl({ user, taskId, runId, name }) {
  const queue = getClient({ Class: Queue, user });

  if (user) {
    return queue.buildSignedUrlSync(queue.getArtifact, taskId, runId, name, {
      expiration: 60,
    });
  }

  return queue.buildUrl(queue.getArtifact, taskId, runId, name);
}

/**
 * Like getArtifactUrl, but calling queue.getLatestArtifact instead.
 */
export function getLatestArtifactUrl({ user, taskId, name }) {
  const queue = getClient({ Class: Queue, user });

  if (user) {
    return queue.buildSignedUrlSync(queue.getLatestArtifact, taskId, name, {
      expiration: 60,
    });
  }

  return queue.buildUrl(queue.getLatestArtifact, taskId, name);
}

/**
 * Like getArtifactUrl, but calling index.findArtifactFromTask instead.
 */
export function findArtifactFromTaskUrl({ user, namespace, name }) {
  const index = getClient({ Class: Index, user });

  if (user) {
    return index.buildSignedUrlSync(
      index.findArtifactFromTask,
      namespace,
      name,
      { expiration: 60 }
    );
  }

  return index.buildUrl(index.findArtifactFromTask, namespace, name);
}
