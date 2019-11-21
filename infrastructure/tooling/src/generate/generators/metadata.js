const _ = require('lodash');
const path = require('path');
const config = require('taskcluster-lib-config');
const {listServices, readRepoYAML, REPO_ROOT} = require('../../utils');

const SERVICES = listServices();

exports.tasks = [];

SERVICES.forEach(name => {
  exports.tasks.push({
    title: `Fetch service metadata for ${name}`,
    requires: [],
    provides: [`configs-${name}`, `procslist-${name}`, `scopes-${name}`, `azure-${name}`],
    run: async (requirements, utils) => {
      const envVars = config({
        files: [{
          path: path.join(REPO_ROOT, 'services', name, 'config.yml'),
          required: true,
        }],
        getEnvVars: true,
      });

      const procs = await readRepoYAML(path.join('services', name, 'procs.yml'));

      const readOrNull = async path => {
        try {
          return await readRepoYAML(path);
        } catch (err) {
          if (err.code !== 'ENOENT') {
            throw err;
          }
        }
        return null;
      };

      return {
        [`configs-${name}`]: envVars,
        [`procslist-${name}`]: procs,
        [`scopes-${name}`]: await readOrNull(path.join('services', name, 'scopes.yml')),
        [`azure-${name}`]: await readOrNull(path.join('services', name, 'azure.yml')),
      };
    },
  });
});
