const assert = require('assert');
const path = require('path');
const fs = require('fs');
const _ = require('lodash');
const yaml = require('js-yaml');
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
    const taskclusterYmlFile = path.join(REPO_ROOT, '.taskcluster.yml');
    const taskclusterYml = yaml.safeLoad(fs.readFileSync(taskclusterYmlFile, 'utf8'));

    // Node version in .taskcluster.yml matches that in package.json
    assert.equal(taskclusterYml.tasks.then.$let.node, packageJson.engines.node);

    // Node version for UI matches the rest of the repo
    assert.equal(taskclusterYml.tasks.then.$let.node, uiPackageJson.engines.node);
  },
});
