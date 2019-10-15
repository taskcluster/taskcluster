const path = require('path');
const got = require('got');
const {listServices, readRepoYAML} = require('../../utils');

const SERVICES = listServices();

exports.tasks = [];

SERVICES.forEach(name => {
  exports.tasks.push({
    title: `Ping health endpoint for ${name}`,
    requires: [],
    provides: [
      `ping-${name}`,
    ],
    run: async (requirements, utils) => {
      const procs = await readRepoYAML(path.join('services', name, 'procs.yml'));

      let status = 'skipped';

      for (const proc of Object.values(procs)) {
        if (proc.type === 'web') {
          const healthcheck = proc.readinessPath || `api/${name}/v1/ping`;
          const resp = await got.get(`${process.env.TASKCLUSTER_ROOT_URL}/${healthcheck}`);

          // For now we just check statuscode because ping doesn't return
          // anything useful anyway and web-server doesn't even return json.
          if (resp.statusCode === 200) {
            status = 'alive';
          } else {
            status = 'dead';
          }
        }
      }

      if (status === 'skipped') {
        return utils.skip({
          reason: 'No exposed web service',
        });
      }
    },
  });
});

exports.tasks.push({
  title: `API ping endpoints succeed (--target ping)`,
  requires: [
    ...SERVICES.map(name => `ping-${name}`),
  ],
  provides: [
    `target-ping`,
  ],
  run: async (requirements, utils) => {},
});
