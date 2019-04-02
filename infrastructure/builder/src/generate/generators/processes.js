const path = require('path');
const {services, readYAML, writeYAML, writeFile} = require('../util');

const SERVICES = services();

exports.tasks = [];

SERVICES.forEach(name => {
  exports.tasks.push({
    title: `Generate Procfile for ${name}`,
    requires: [],
    provides: [
      `procs-${name}`,
    ],
    run: async (requirements, utils) => {
      // This can all be removed and merged with Helm generation once we're no longer running in Heroku
      const procs = await readYAML(path.join('services', name, 'procs.yml'));

      const res = ['# GENERATED FILE from `yarn generate`! To update, change procs.yml and regenerate.\n'];

      Object.entries(procs).forEach(([proc, {command}]) => {
        res.push(`${proc}: cd services/${name} && ${command}`);
      });

      await writeFile(path.join('services', name, 'Procfile'), res.join('\n'));

      return {
        [`procs-${name}`]: procs,
      };
    },
  });
  exports.tasks.push({
    title: `Generate Helm for ${name}`,
    requires: [`procs-${name}`],
    provides: [],
    run: async (requirements, utils) => {
      const configs = [];

      Object.entries(requirements[`procs-${name}`]).forEach(([proc, meta]) => {
        const proc_types = ['web', 'heroku-only', 'cron', 'build', 'background'];

        // Plan here is to load templates of each of these types (deployment, service), render them a bit, and
        // then write them out per-service
        switch (meta.type) {
          case 'heroku-only': return;
          case 'build': return;
          case 'web': configs.push({kind: 'Deployment'}); break;
          case 'cron': configs.push({kind: 'CronJob'}); break;
          case 'background': configs.push({kind: 'Deployment'}); break;
          default: throw new Error(`Process type ${meta.type} not recognized. Must be one of ${JSON.stringify(proc_types)}`);
        }
      });

      writeYAML(path.join('infrastructure', 'helm', 'templates', `${name}.yaml`), ...configs);
      return {};
    },
  });
});
