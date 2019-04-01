const assert = require('assert');
const path = require('path');
const {services, readYAML, writeJSON, writeFile} = require('../util');

const SERVICES = services();

const PROC_TYPES = ['web', 'heroku-only', 'cron', 'build', 'background'];

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
      const procs = await readYAML(path.join('services', name, 'procs.yml'));

      const res = ['# GENERATED FILE from `yarn generate`! To update, change procs.yml and regenerate.\n'];

      Object.entries(procs).forEach(([proc, {command}]) => {
        res.push(`${proc}: cd services/${name} && ${command}`);
      });

      await writeFile(path.join('services', name, 'Procfile'), res.join('\n'));

      return {
        [`procs-${name}`]: {procs, name},
      };
    },
  });
});

exports.tasks.push({
  title: `Generate Helm values.yaml`,
  requires: SERVICES.map(name => `procs-${name}`),
  provides: [
    'helm-values',
  ],
  run: async (requirements, utils) => {
    const values = {
      web: [],
      background: [],
      cron: [],
      secrets: [],
    };
    Object.values(requirements).forEach(({name, procs}) => {
      Object.entries(procs).forEach(([proc, meta]) => {
        assert(PROC_TYPES.includes(meta.type), `Process type ${meta.type} not recognized.`);
        if (['heroku-only', 'build'].includes(meta.type)) {
          return;
        }
        const {type, ...res} = meta;
        values[meta.type].push({...res, service: name, proc});
      });
    });

    await writeJSON(path.join('infrastructure', 'helm', 'values.yaml'), values);
    return {
      'helm-values': values,
    };
  },
});
