const path = require('path');
const {listServices, readRepoYAML, writeRepoFile} = require('../../utils');

const SERVICES = listServices();

exports.tasks = [];

// This can all be removed once we're no longer running in Heroku

SERVICES.forEach(name => {
  exports.tasks.push({
    title: `Generate Procfile for ${name}`,
    requires: [],
    provides: [
      `procs-${name}`,
    ],
    run: async (requirements, utils) => {
      const procs = await readRepoYAML(path.join('services', name, 'procs.yml'));

      const res = ['# GENERATED FILE from `yarn generate`! To update, change procs.yml and regenerate.\n'];

      Object.entries(procs).forEach(([proc, {command}]) => {
        res.push(`${proc}: cd services/${name} && ${command}`);
      });

      await writeRepoFile(path.join('services', name, 'Procfile'), res.join('\n'));

      return {
        [`procs-${name}`]: procs,
      };
    },
  });
});
