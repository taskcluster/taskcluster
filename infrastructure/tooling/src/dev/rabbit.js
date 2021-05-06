const slugid = require('slugid');
const request = require('superagent');

const servicesWithoutRabbitConfig = (userConfig, configTmpl) => {
  let services = [];
  for (const [name, cfg] of Object.entries(configTmpl)) {
    if (cfg.pulse_username !== undefined && (!userConfig[name] || !userConfig[name].pulse_username)) {
      services.push(name);
    }
  }

  return services;
};

const rabbitPrompts = ({ userConfig, prompts, configTmpl }) => {
  const setupNeeded = servicesWithoutRabbitConfig(userConfig, configTmpl);

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
    default: previous => previous.meta?.deploymentPrefix || userConfig.meta?.deploymentPrefix,
    message: 'What is the vhost for this deployment inside your rabbitmq cluster?',
    validate: vhost => {
      if (!/^[a-z0-9]+$/.test(vhost)) {
        return 'Must consist of lowercase characters and numbers';
      }
      return true;
    },
  });

  prompts.push({
    type: 'input',
    when: () => setupNeeded.length,
    default: () => userConfig.meta?.rabbitAdminUser || '',
    name: 'meta.rabbitAdminUser',
    message: 'We have detected we need to set up some new rabbitmq accounts. Provide a rabbitmq admin username.',
  });

  prompts.push({
    type: 'password',
    when: () => setupNeeded.length,
    name: 'rabbitAdminPassword',
    message: 'Now the password for that user.',
  });
};

const rabbitResources = async ({ userConfig, answer, configTmpl }) => {
  const setupNeeded = servicesWithoutRabbitConfig(userConfig, configTmpl);
  const { rabbitAdminPassword } = answer;

  // if we didn't decide we needed rabbit setup, then there's nothing to do
  if (!rabbitAdminPassword) {
    return userConfig;
  }

  // we specifically want to exclude the admin password from userConfig, so
  // remove it from the answers
  delete answer.rabbitAdminPassword;

  const host = `https://${answer.pulseHostname || userConfig.pulseHostname}/api`;
  const agent = request.agent().auth(answer.meta?.rabbitAdminUser, rabbitAdminPassword).type('json');
  const vhost = answer.pulseVhost || userConfig.pulseVhost;
  console.log(`(Re-)creating RabbitMQ vhost ${vhost}`);
  await agent.put(`${host}/vhosts/${encodeURIComponent(vhost)}`);

  for (const service of setupNeeded) {
    const user = `${vhost}-taskcluster-${service.replace(/_/g, '-')}`;
    const password = slugid.v4();

    console.log(`Creating RabbitMQ user ${user}`);
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

    userConfig[service].pulse_username = user;
    userConfig[service].pulse_password = password;
  }

  return userConfig;
};

module.exports = {
  rabbitPrompts,
  rabbitResources,
};
