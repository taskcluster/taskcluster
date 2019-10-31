const path = require('path');
const libUrls = require('taskcluster-lib-urls');
const got = require('got');
const {listServices, readRepoYAML} = require('../../utils');

const SERVICES = listServices();

exports.scopeExpression = {AllOf: []};
exports.tasks = [];

exports.tasks.push({
  title: `Ping health endpoint for web-server`,
  requires: [],
  provides: [
    `ping-web-server`,
  ],
  run: async (requirements, utils) => {
    if (process.env.TASKCLUSTER_ROOT_URL === 'https://taskcluster.net') {
      return utils.skip({reason: 'Not supported on legacy deployment'});
    }
    const serverHealth = `${process.env.TASKCLUSTER_ROOT_URL}/.well-known/apollo/server-health`;
    const resp = await got.get(serverHealth);

    // For now we just check statuscode because ping doesn't return
    // anything useful anyway and web-server doesn't even return json.
    if (resp.statusCode !== 200) {
      throw new Error(`${name} is not responding`);
    }
  },
});

SERVICES.filter(name => name !== 'web-server').forEach(name => {
  exports.tasks.push({
    title: `Ping health endpoint for ${name}`,
    requires: [],
    provides: [
      `ping-${name}`,
    ],
    run: async (requirements, utils) => {
      const procs = await readRepoYAML(path.join('services', name, 'procs.yml'));

      let checked = false;

      for (const proc of Object.values(procs)) {
        if (proc.type === 'web') {
          const healthcheck = libUrls.api(process.env.TASKCLUSTER_ROOT_URL, name, 'v1', 'ping');
          const resp = await got.get(healthcheck);

          // For now we just check statuscode because ping doesn't return
          // anything useful anyway and web-server doesn't even return json.
          if (resp.statusCode !== 200) {
            throw new Error(`${name} is not responding`);
          }
          checked = true;
        }
      }

      if (!checked) {
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
