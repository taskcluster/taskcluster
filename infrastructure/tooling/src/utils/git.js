import util from 'util';
import { execFile } from 'child_process';
import fs from 'fs';
import assert from 'assert';
const exec = util.promisify(execFile);

/**
 * Perform a git clone
 *
 * - dir -- directory to clone to
 * - url -- repo#ref URL to clone
 * - utils -- taskgraph utils (waitFor, etc.)
 *
 * Returns:
 * {
 *   exactRev: ..,     // the exact revision checked out
 *   changed: ..,      // true if the repo was cloned or the revision changed
 * }
 */
export const gitClone = async ({ dir, url, sha, utils }) => {
  const [repo, ref = 'main'] = url.split('#');
  const opts = { cwd: dir };

  if (fs.existsSync(dir)) {
    const existingRev = (await exec('git', ['rev-parse', 'HEAD'], opts)).stdout.split(/\s+/)[0];
    const remoteRev = (await exec('git', ['ls-remote', repo, ref])).stdout.split(/\s+/)[0];

    if (!remoteRev) {
      throw new Error(`${url} does not exist!`);
    }

    if (existingRev === remoteRev) {
      return { exactRev: existingRev, changed: false };
    }
  }

  // We _could_ try to manipulate the repo that already exists by
  // fetching and checking out, but it can get into weird states easily.
  // This is doubly true when we do things like set depth=1 etc.
  //
  // Instead, we just blow it away and clone. This is lightweight since we
  // do use that depth=1 anyway.
  await exec('rm', ['-rf', dir]);
  const cloneArgs = ['clone', repo, dir, '--depth=1'].concat(ref === 'HEAD' ? [] : ['-b', ref]);
  await exec('git', cloneArgs);
  const exactRev = (await exec('git', ['rev-parse', 'HEAD'], opts)).stdout;
  return { exactRev: exactRev.split(/\s+/)[0], changed: true };
};

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
export const gitRemoteRev = async ({ dir, remote, ref, utils }) => {
  const opts = { cwd: dir };

  assert(fs.existsSync(dir), `${dir} does not exist`);
  const res = await exec('git', ['ls-remote', remote, ref], opts);
  const lines = res.stdout.split("\n");
  if (lines.length !== 2) {
    throw new Error(`Expected exactly one result from ls-remote; got ${res.stdout}`);
  }
  return {
    revision: lines[0].split('\t')[0].trim(),
  };
};

/**
 * Call `git status --porcelain` in repoDir and return true if anything appears.
 */
export const gitIsDirty = async ({ dir }) => {
  const opts = { cwd: dir };
  const status = (await exec('git', ['status', '--porcelain'], opts))
    .stdout.split(/\n/)
    .filter(l => l !== '');
  return status.length > 0;
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
export const gitCurrentBranch = async ({ dir, utils }) => {
  const opts = { cwd: dir };

  assert(fs.existsSync(dir), `${dir} does not exist`);
  const revParse = await exec('git', ['rev-parse', '--abbrev-ref', 'HEAD'], opts);
  return {
    ref: revParse.stdout.trim(),
  };
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
export const gitCommit = async ({ dir, message, files, utils }) => {
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
export const gitTag = async ({ dir, rev, tag, utils }) => {
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
export const gitPush = async ({ dir, remote, refs, force, utils }) => {
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
  return res.stdout
    .split(/\n/)
    .filter(l => l !== '');
};
