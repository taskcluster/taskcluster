import _ from 'lodash';
import path from 'path';
import config from 'taskcluster-lib-config';
import { listServices, readRepoYAML } from '../../utils';

const SERVICES = listServices();

export const tasks = [];

SERVICES.forEach(name => {
  exports.tasks.push({
    title: `Fetch service metadata for ${name}`,
    requires: [],
    provides: [`configs-${name}`, `procslist-${name}`, `scopes-${name}`],
    run: async (requirements, utils) => {
      const envVars = config({
        serviceName: name,
        // only list config.yml, to avoid grabbing information from user-config.yml
        files: [{ path: 'config.yml', required: true }],
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
      };
    },
  });
});
