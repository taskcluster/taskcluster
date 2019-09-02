const slugid = require('slugid');
const request = require('superagent');

module.exports = ({userConfig, prompts, configTmpl}) => {

  prompts.push({
    when: () => !userConfig.pulseHostname,
    type: 'input',
    name: 'pulseHostname',
    message: 'What is the hostname of your rabbitmq cluster? (no protocol or trailing slash)',
    validate: h => {
      if (h.includes('://')) {
        return 'hostname must not include protocol';
      }
      if (h.endsWith('/')) {
        return 'hostname should not include trailing slash';
      }
      return true;
    },
  });

  prompts.push({
    when: () => !userConfig.pulseVhost,
    type: 'input',
    name: 'pulseVhost',
    default: previous => (previous.meta || {}).deploymentPrefix || (userConfig.meta || {}).deploymentPrefix,
    message: 'What is the vhost for this deployment inside your rabbitmq cluster?',
    validate: vhost => {
      if (!/^[a-z0-9]+$/.test(vhost)) {
        return 'Must consist of lowercase characters and numbers';
      }
      return true;
    },
  });

  let rabbitSetupNeeded = [];
  for (const [name, cfg] of Object.entries(configTmpl)) {
    if (cfg.pulse_username !== undefined && (!userConfig[name] || !userConfig[name].pulse_username)) {
      rabbitSetupNeeded.push(name);
    }
  }

  prompts.push({
    type: 'input',
    when: () => rabbitSetupNeeded.length,
    default: () => (userConfig.meta || {}).rabbitAdminUser || '',
    name: 'meta.rabbitAdminUser',
    message: 'We have detected we need to set up some new rabbitmq accounts. Provide a rabbitmq admin username.',
  });

  prompts.push({
    type: 'password',
    when: () => rabbitSetupNeeded.length,
    name: 'meta.rabbitAdminPassword',
    message: 'Now the password for that user.',
    filter: async (pw, previous) => {
      const host = `https://${previous.pulseHostname || userConfig.pulseHostname}/api`;
      const agent = request.agent().auth(previous.meta.rabbitAdminUser, pw).type('json');
      const vhost = previous.pulseVhost || userConfig.pulseVhost;
      await agent.put(`${host}/vhosts/${encodeURIComponent(vhost)}`);

      const users = {};
      for (const service of rabbitSetupNeeded) {
        const user = `${vhost}-taskcluster-${service.replace(/_/g, '-')}`;
        const password = slugid.v4();

        await agent.put(`${host}/users/${encodeURIComponent(user)}`).send({
          password,
          tags: '',
        });
        const regexName = `taskcluster\\-${service.replace(/_/g, '\\-')}`;
        await agent.put(`${host}/permissions/${encodeURIComponent(vhost)}/${encodeURIComponent(user)}`).send({
          configure: `^(queue/${regexName}/.*|exchange/${regexName}/.*)`,
          write: `^(queue/${regexName}/.*|exchange/${regexName}/.*)`,
          read: `^(queue/${regexName}/.*|exchange/.*)`,
        });

        users[service] = users[service] || {};
        users[service].pulse_username = user;
        if (!['hooks', 'auth'].includes(service)) { // These services hardcode namespace TODO: fix?
          users[service].pulse_namespace = `taskcluster-${service.replace(/_/g, '-')}`;
        }
        users[service].pulse_password = password;
      }
      return users;
    },
  });
};
