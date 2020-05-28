const assert = require('assert');
const path = require('path');
const fs = require('fs');
const _ = require('lodash');
const {REPO_ROOT} = require('../../utils');

exports.tasks = [];
exports.tasks.push({
  title: 'Node versions match',
  requires: [],
  provides: [],
  run: async () => {
    const packageJsonFile = path.join(REPO_ROOT, 'package.json');
    const uiPackageJsonFile = path.join(REPO_ROOT, 'ui/package.json');
    const packageJson = JSON.parse(fs.readFileSync(packageJsonFile, 'utf8'));
    const uiPackageJson = JSON.parse(fs.readFileSync(uiPackageJsonFile, 'utf8'));

    // Node version for UI matches the rest of the repo
    assert.equal(packageJson.engines.node, uiPackageJson.engines.node);
  },
});
