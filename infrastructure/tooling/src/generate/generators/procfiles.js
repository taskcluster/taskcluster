import path from 'node:path';
import { listServices, readRepoYAML } from '../../utils/index.js';

const SERVICES = listServices();

export const tasks = [];

tasks.push({
  title: `Read procs.yml for all services`,
  requires: [],
  provides: SERVICES.map(name => `procs-${name}`),
  run: async (_requirements, _utils) => {
    const provides = {};
    for (const name of SERVICES) {
      provides[`procs-${name}`] = await readRepoYAML(path.join('services', name, 'procs.yml'));
    }

    return provides;
  },
});
