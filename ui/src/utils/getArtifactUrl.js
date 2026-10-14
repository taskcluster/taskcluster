import { Queue, Index } from '@taskcluster/client-web';
import { getClient } from './client';
import { getAnonymousScopes, isPublicArtifact } from './anonymousScopes';

const shouldSign = ({ user, anonymousScopes, name }) =>
  Boolean(user?.credentials) && !isPublicArtifact(anonymousScopes, name);

/**
 * Get a signed URL that can be used to fetch the given task.  This URL is
 * time-limited and should be used immediately.  If there is no current user,
 * or the artifact is readable with `anonymousScopes`, then the URL is not
 * signed.  Calling components should use `withAuth` to get `props.user` and
 * `withAnonymousScopes` to get `props.anonymousScopes`.
 */
export function getArtifactUrl({ user, anonymousScopes, taskId, runId, name }) {
  const queue = getClient({ Class: Queue, user });

  if (shouldSign({ user, anonymousScopes, name })) {
    return queue.buildSignedUrlSync(queue.getArtifact, taskId, runId, name, {
      expiration: 60,
    });
  }

  return queue.buildUrl(queue.getArtifact, taskId, runId, name);
}

/**
 * Like getArtifactUrl, but calling queue.getLatestArtifact instead.
 */
export function getLatestArtifactUrl({ user, anonymousScopes, taskId, name }) {
  const queue = getClient({ Class: Queue, user });

  if (shouldSign({ user, anonymousScopes, name })) {
    return queue.buildSignedUrlSync(queue.getLatestArtifact, taskId, name, {
      expiration: 60,
    });
  }

  return queue.buildUrl(queue.getLatestArtifact, taskId, name);
}

/**
 * Like getLatestArtifactUrl, but for callers that can await: fetches the
 * anonymous scopes, and only if the artifact is not public, fresh credentials
 * from `getCredentials` to sign the URL with.
 */
export async function resolveLatestArtifactUrl({
  getCredentials,
  taskId,
  name,
}) {
  const anonymousScopes = await getAnonymousScopes();
  const credentials = isPublicArtifact(anonymousScopes, name)
    ? undefined
    : await getCredentials?.();

  return getLatestArtifactUrl({
    user: credentials ? { credentials } : null,
    anonymousScopes,
    taskId,
    name,
  });
}

/**
 * Like getArtifactUrl, but calling index.findArtifactFromTask instead.
 */
export function findArtifactFromTaskUrl({
  user,
  anonymousScopes,
  namespace,
  name,
}) {
  const index = getClient({ Class: Index, user });

  if (shouldSign({ user, anonymousScopes, name })) {
    return index.buildSignedUrlSync(
      index.findArtifactFromTask,
      namespace,
      name,
      { expiration: 60 }
    );
  }

  return index.buildUrl(index.findArtifactFromTask, namespace, name);
}
