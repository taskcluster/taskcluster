const _ = require('lodash');
const path = require('path');
const config = require('taskcluster-lib-config');
const {listServices, readRepoYAML, REPO_ROOT} = require('../../utils');

// We're not going to deploy login into k8s
const SERVICES = listServices().filter(s => !['login'].includes(s));

exports.tasks = [];

SERVICES.forEach(name => {
  exports.tasks.push({
    title: `Fetch service metadata for ${name}`,
    requires: [],
    provides: [`configs-${name}`, `procslist-${name}`, `scopes-${name}`],
    run: async (requirements, utils) => {
      const envVars = config({
        files: [{
          path: path.join(REPO_ROOT, 'services', name, 'config.yml'),
          required: true,
        }],
        getEnvVars: true,
      });

      const procs = await readRepoYAML(path.join('services', name, 'procs.yml'));

      const scopesPath = path.join('services', name, 'scopes.yml');
      let scopes = null;
      try {
        scopes = await readRepoYAML(scopesPath);
      } catch (err) {
        if (err.code !== 'ENOENT') {
          throw err;
        }
      }
      return {
        [`configs-${name}`]: envVars,
        [`procslist-${name}`]: procs,
        [`scopes-${name}`]: scopes,
      };
    },
  });
});
