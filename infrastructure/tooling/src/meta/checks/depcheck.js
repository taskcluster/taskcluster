const assert = require('assert');
const path = require('path');
const util = require('util');
const depcheck = require('depcheck');
const exec = util.promisify(require('child_process').exec);
const _ = require('lodash');
const {REPO_ROOT} = require('../../utils');

exports.tasks = [];
exports.tasks.push({
  title: 'Dependencies are used',
  requires: [],
  provides: [],
  run: async (requirements, utils) => {
    const depOptions = {
      specials: [], // don't target webpack
    };
    utils.status({message: "root (slow)"});
    const root = await depcheck(REPO_ROOT, depOptions);
    assert(Object.keys(root.missing).length === 0, `Missing root deps: ${JSON.stringify(root.missing)}`);

    const rootPkg = require(path.join(REPO_ROOT, 'package.json'));
    const rootDeps = (Object.keys(rootPkg.dependencies || {})).concat((Object.keys(rootPkg.devDependencies || {})));

    const { stdout } = await exec('yarn workspaces info -s');
    const packages = Object.values(JSON.parse(stdout)).map(p => p.location);
    const unused = {};
    const missing = {};
    for (const pkg of packages) {
      utils.status({message: pkg});
      const leaf = await depcheck(path.join(REPO_ROOT, pkg), depOptions);
      if (leaf.dependencies.length !== 0) {
        unused[pkg] = leaf.dependencies;
      }

      // Note that this will be not take into account whether it will be in production or not
      const missed = _.difference(Object.keys(leaf.missing), rootDeps);
      if (missed.length !== 0) {
        missing[pkg] = _.pick(leaf.missing, missed);
      }
    }

    assert(Object.keys(unused).length === 0, `Unused dependencies: ${JSON.stringify(unused, null, 2)}`);
    assert(Object.keys(missing).length === 0, `Missing dependencies: ${JSON.stringify(missing, null, 2)}`);
  },
});
