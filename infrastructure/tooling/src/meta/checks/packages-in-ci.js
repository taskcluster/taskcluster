const assert = require('assert');
const util = require('util');
const exec = util.promisify(require('child_process').exec);
const path = require('path');
const fs = require('fs');
const _ = require('lodash');
const yaml = require('js-yaml');
const {REPO_ROOT} = require('../../utils');

exports.tasks = [];
exports.tasks.push({
  title: 'All packages are tested in CI',
  requires: [],
  provides: [],
  run: async () => {
    const taskclusterYmlFile = path.join(REPO_ROOT, '.taskcluster.yml');
    const taskclusterYml = yaml.safeLoad(fs.readFileSync(taskclusterYmlFile, 'utf8'));

    const configured = taskclusterYml.tasks.then.in.$let.packages.map(pkg => pkg.name);

    const { stdout } = await exec('yarn workspaces info -s');
    const existing = Object.keys(JSON.parse(stdout))
      // taskcluster-client is tested separately
      .filter(name => name !== 'taskcluster-client');

    const extra = _.difference(configured, existing);
    const missing = _.difference(existing, configured);

    const warning = 'CI configuration in .taskcluster.yml is misconfigured.';
    assert(missing.length === 0, `${warning} Missing: ${JSON.stringify(missing)}`);
    assert(extra.length === 0, `${warning} Remove: ${JSON.stringify(extra)}`);
  },
});
