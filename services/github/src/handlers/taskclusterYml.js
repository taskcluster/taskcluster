import { getRawYml, makeDebug } from './utils.js';
import { TASKCLUSTER_YML_PATH } from '../constants.js';

// GitHub caps the push payload's `commits` array at 2048 entries, and each
// commit's file lists at 3000 names between them.  Neither cap comes with a
// count of what was dropped, so hitting one is the only signal we get.
// https://docs.github.com/en/webhooks/webhook-events-and-payloads#push
const COMMITS_LIMIT = 2048;
const FILES_LIMIT = 3000;

/**
 * Decide whether a push changed `.taskcluster.yml`.
 *
 * The commit list answers this on its own unless GitHub truncated it, either by
 * dropping commits or by dropping file names within one, in which case the file
 * may have changed somewhere we were never told about. Reading the file at both
 * ends of the push is then the only way to find out.
 *
 * Detection is best effort.  GitHub lists only the commits a push adds relative
 * to the common ancestor of `before` and `after`, so a force push that drops a
 * commit reports no changed files at all.  Catching that would cost a compare
 * call on every force push, which the rate limit has no room for.
 */
async function pushChangedTaskclusterYml(github, installationId, body) {
  const commits = body.commits;
  const touched = commits.some(
    ({ added = [], removed = [], modified = [] }) =>
      modified.includes(TASKCLUSTER_YML_PATH) ||
      added.includes(TASKCLUSTER_YML_PATH) ||
      removed.includes(TASKCLUSTER_YML_PATH)
  );
  if (touched) {
    return true;
  }

  const listComplete =
    commits.length < COMMITS_LIMIT &&
    commits.every(
      ({ added = [], removed = [], modified = [] }) => added.length + removed.length + modified.length < FILES_LIMIT
    );
  if (listComplete) {
    return false;
  }

  // A ref this push created has no `before` to read, and one it deleted has no
  // `after`.  Either way the file did not exist at that end of the push, which
  // is what a missing file reads as anyway.
  const owner = body.repository.owner.name;
  const repo = body.repository.name;
  const instGithub = await github.getInstallationGithub(installationId);
  const [before, after] = await Promise.all([
    body.created ? null : getRawYml({ instGithub, owner, repo, ref: body.before }),
    body.deleted ? null : getRawYml({ instGithub, owner, repo, ref: body.after }),
  ]);
  return before !== after;
}

/**
 * Announce that a push changed a repository's `.taskcluster.yml`.
 *
 * This runs off the push exchange rather than in the webhook endpoint so that a
 * slow or failing GitHub API call cannot fail the webhook delivery, which would
 * invite a redelivery of an event whose tasks have already been created.
 **/
export async function taskclusterYmlHandler(message) {
  const { body, eventId, installationId } = message.payload;
  const owner = body.repository.owner.name;
  const repo = body.repository.name;
  const debug = makeDebug(this.monitor, { eventId, installationId, owner, repo });

  if (!(await pushChangedTaskclusterYml(this.context.github, installationId, body))) {
    return;
  }

  debug(`${TASKCLUSTER_YML_PATH} changed in ${owner}/${repo}, publishing`);
  await this.context.publisher.taskclusterYmlUpdate({
    organization: owner,
    repository: repo,
    ref: body.ref,
    eventId,
  });
}

export default taskclusterYmlHandler;
