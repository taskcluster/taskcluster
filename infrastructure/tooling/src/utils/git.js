import util from 'node:util';
import { execFile } from 'node:child_process';
import fs from 'node:fs';
import assert from 'node:assert';
const exec = util.promisify(execFile);

/**
 * Fetch a ref from a remote repository
 *
 * - dir: repository directory
 * - remote: remote repository URL
 * - ref: ref to fetch from the remote repository
 * - utils: taskgraph utils
 *
 * Returns:
 * {
 *   revision: .., // the sha of the remote ref
 * }
 */
export const gitRemoteRev = async ({ dir, remote, ref }) => {
  const opts = { cwd: dir };

  assert(fs.existsSync(dir), `${dir} does not exist`);
  const res = await exec('git', ['ls-remote', remote, ref], opts);
  const lines = res.stdout.split('\n');
  if (lines.length !== 2) {
    throw new Error(`Expected exactly one result from ls-remote; got ${res.stdout}`);
  }
  return {
    revision: lines[0].split('\t')[0].trim(),
  };
};

/**
 * Call `git status --porcelain` in repoDir.
 */
export const gitStatus = async ({ dir }) => {
  const opts = { cwd: dir };
  return (await exec('git', ['status', '--porcelain'], opts)).stdout.split(/\n/).filter(l => l !== '');
};

/**
 * Call `git status --porcelain` in repoDir and return true if anything appears.
 */
export const gitIsDirty = async ({ dir }) => {
  return (await gitStatus({ dir })).length > 0;
};

/**
 * Get exactRev from an existing repo (usually this one..)
 *
 * - dir -- directory to check
 *
 * (note that utils is not required)
 *
 * Returns:
 * {
 *   gitDescription: .., // symbolic description of the revision
 *   revision: ..,       // sha
 * }
 */
export const gitDescribe = async ({ dir }) => {
  const opts = { cwd: dir };

  assert(fs.existsSync(dir), `${dir} does not exist`);
  const describe = await exec('git', ['describe', '--tag', '--always', '--match', 'v*.*.*'], opts);
  const revision = await exec('git', ['rev-parse', 'HEAD'], opts);
  return {
    gitDescription: describe.stdout.split(/\s+/)[0],
    revision: revision.stdout.trim(),
  };
};

/**
 * Get the current branch
 *
 * - dir -- directory to check
 *
 * Returns:
 * {
 *   ref: ..., // abbreviated ref
 * }
 */
export const gitCurrentBranch = async ({ dir }) => {
  const opts = { cwd: dir };

  assert(fs.existsSync(dir), `${dir} does not exist`);
  const revParse = await exec('git', ['rev-parse', '--abbrev-ref', 'HEAD'], opts);
  return {
    ref: revParse.stdout.trim(),
  };
};

/**
 * Check out a ref, or detach HEAD at the current commit
 *
 * - dir -- repository directory
 * - ref -- branch name or sha to check out (ignored if detach is true)
 * - detach -- if true, run `git checkout --detach` (stay on the same commit)
 */
export const gitCheckout = async ({ dir, ref, detach }) => {
  const opts = { cwd: dir };
  await exec('git', ['checkout', ...(detach ? ['--detach'] : [ref])], opts);
};

/**
 * Discard all changes to tracked files (`git reset --hard`).  Only call this
 * when the caller has proven the tree held nothing worth keeping.
 *
 * - dir -- repository directory
 */
export const gitResetHard = async ({ dir }) => {
  const opts = { cwd: dir };
  await exec('git', ['reset', '--hard'], opts);
};

/**
 * Stage files in git (git add)
 *
 * - dir -- directory to commit in
 * - files -- files to stage
 */
export const gitAdd = async ({ dir, files }) => {
  const opts = { cwd: dir };
  await exec('git', ['add', ...files], opts);
};

/**
 * Perform a git commit
 *
 * - dir -- directory to commit in
 * - message -- the commit message
 * - files -- files to include in the commit (anything staged will get committed too..)
 * - utils -- taskgraph utils (waitFor, etc.)
 */
export const gitCommit = async ({ dir, message, files }) => {
  const opts = { cwd: dir };
  await exec('git', ['commit', '-m', message, ...files], opts);
};

/**
 * Create a git tag.  This does not use `-f`, so existing tags will cause an error.
 *
 * - dir -- directory to commit in
 * - rev -- revision to tag
 * - tag -- tag to apply
 */
export const gitTag = async ({ dir, rev, tag }) => {
  const opts = { cwd: dir };
  await exec('git', ['tag', tag, rev], opts);
};

/**
 * Push to an external repo.  This does not use `-f`.
 *
 * - dir -- directory to commit in
 * - remote -- remote to push to
 * - refs -- refs to push
 * - force -- if true, -f
 */
export const gitPush = async ({ dir, remote, refs, force }) => {
  const opts = { cwd: dir };
  await exec('git', ['push', ...(force ? ['-f'] : []), remote, ...refs], opts);
};

/**
 * Run `git log` and return the results in an array of lines.
 *
 * - dir -- directory to run in
 * - args -- arguments to `git log`
 */
export const gitLog = async ({ dir, args }) => {
  const opts = { cwd: dir };
  const res = await exec('git', ['log', ...args], opts);
  return res.stdout.split(/\n/).filter(l => l !== '');
};
