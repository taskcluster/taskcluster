import path from 'path';
import { listServices, readRepoYAML } from '../../utils/index.js';

const SERVICES = listServices();

export const tasks = [];

tasks.push({
  title: `Read procs.yml for all services`,
  requires: [],
  provides: SERVICES.map(name => `procs-${name}`),
  run: async (requirements, utils) => {
    const provides = {};
    for (let name of SERVICES) {
      provides[`procs-${name}`] = await readRepoYAML(path.join('services', name, 'procs.yml'));
    }

    return provides;
  },
});
