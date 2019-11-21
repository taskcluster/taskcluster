const assert = require('assert');
const path = require('path');
const fs = require('fs');
const _ = require('lodash');
const yaml = require('js-yaml');
const glob = require('glob');
const Config = require('taskcluster-lib-config');
const {REPO_ROOT} = require('../../utils');

exports.tasks = [];
exports.tasks.push({
  title: 'Azure tables are listed in azure.yml',
  requires: [],
  provides: [],
  run: async () => {
    const services = glob.sync('services/*/', {cwd: REPO_ROOT}).map(path => path.split('/')[1]);
    for (let service of services) {
      const configYmlPath = path.join('services', service, 'config.yml');
      const cfg = Config({
        profile: 'production',
        process: 'meta-test',
        files: [{path: configYmlPath, required: true}],
      });
      if (!cfg.app) {
        continue;
      }

      const tableNames = Object.keys(cfg.app || {}).filter(c => c.endsWith('TableName')).map(c => cfg.app[c]);
      tableNames.sort();

      const azureYmlPath = path.join('services', service, 'azure.yml');
      if (!tableNames.length) {
        assert(!fs.existsSync(azureYmlPath), `${azureYmlPath} exists but there are no tables in ${configYmlPath}`);
        return;
      }
      const azureYmlTables = yaml.safeLoad(fs.readFileSync(azureYmlPath), 'utf8').tables || [];
      azureYmlTables.sort();

      assert.deepEqual(tableNames, azureYmlTables, `tables in ${configYmlPath} and ${azureYmlPath} do not match`);
    }
  },
});
