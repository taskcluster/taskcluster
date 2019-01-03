const assert = require('assert');
const path = require('path');
const fs = require('fs');
const util = require('util');
const exec = util.promisify(require('child_process').exec);
const _ = require('lodash');
const yaml = require('js-yaml');

suite('Repo Meta Tests', function() {

  test('All packages in CI', async function() {
    const tcconf = path.join(__dirname, '..', '.taskcluster.yml');
    const tcyml = yaml.safeLoad(fs.readFileSync(tcconf, 'utf8'));
    const configured = tcyml.tasks['$let'].packages;

    const {stdout, stderr} = await exec('yarn workspaces info -s');
    const existing = Object.keys(JSON.parse(stdout));

    const extra = _.difference(configured, existing);
    const missing = _.difference(existing, configured);

    const warning = 'CI configuration in .taskcluster.yml is misconfigured.';
    assert(missing.length === 0, `${warning} Missing: ${JSON.stringify(missing)}`);
    assert(extra.length === 0, `${warning} Remove: ${JSON.stringify(extra)}`);
  });

});
