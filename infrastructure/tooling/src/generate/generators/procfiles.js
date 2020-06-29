const path = require('path');
const {listServices, readRepoYAML} = require('../../utils');

const SERVICES = listServices();

exports.tasks = [];

exports.tasks.push({
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
