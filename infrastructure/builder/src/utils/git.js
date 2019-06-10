const util = require('util');
const exec = util.promisify(require('child_process').execFile);
const fs = require('fs');
const assert = require('assert');

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
exports.gitClone = async ({dir, url, sha, utils}) => {
  const [repo, ref = 'master'] = url.split('#');
  const opts = {cwd: dir};

  if (fs.existsSync(dir)) {
    const existingRev = (await exec('git', ['rev-parse', 'HEAD'], opts)).stdout.split(/\s+/)[0];
    const remoteRev = (await exec('git', ['ls-remote', repo, ref])).stdout.split(/\s+/)[0];

    if (!remoteRev) {
      throw new Error(`${url} does not exist!`);
    }

    if (existingRev === remoteRev) {
      return {exactRev: existingRev, changed: false};
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
  return {exactRev: exactRev.split(/\s+/)[0], changed: true};
};

/**
 * Call `git status --porcelain` in repoDir and return true if anything appears.
 */
exports.gitIsDirty = async ({dir}) => {
  const opts = {cwd: dir};
  const status = (await exec('git', ['status', '--porcelain'], opts))
    .stdout.split(/\n/)
    .filter(l => l !== '');
  return status.length > 0;
};

/**
 * Get exactRev from an existing repo (usually this one..)
 *
 * - dir -- directory to check
 * - utils -- taskgraph utils (waitFor, etc.)
 *
 * Returns:
 * {
 *   exactRev: ..,     // the exact revision checked out (possibly with -dirty suffix)
 * }
 */
exports.gitDescribe = async ({dir, utils}) => {
  const opts = {cwd: dir};

  assert(fs.existsSync(dir), `${dir} does not exist`);
  const describe = await exec('git', ['describe', '--tag', '--always'], opts);
  return {
    gitDescription: describe.stdout.split(/\s+/)[0],
  };
};
