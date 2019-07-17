const slugid = require('slugid');

module.exports = async ({userConfig, answer, configTmpl}) => {
  const oldClients = {};

  userConfig.auth = userConfig.auth || {};

  if (userConfig.auth.static_clients) {
    for (const client of userConfig.auth.static_clients) {
      oldClients[client.clientId] = client;
    }
  }

  userConfig.auth.static_clients = [];

  // It is important we go through in order of configTmpl here to
  // preserve order with the settings in values.yaml. If things
  // are switched up, services will end up with others services
  // creds. Since this is just for a dev cluster, this is ok other than
  // the fact that your services probably won't work
  for (const client of configTmpl.auth.static_clients) {
    if (oldClients[client.clientId]) {
      userConfig.auth.static_clients.push(oldClients[client.clientId]);
      continue;
    }

    const accessToken = slugid.v4() + slugid.v4();

    // We only push accessToken because that's the dynamic part
    // and clientId so that we can find it again. This lets
    // the checked-in version of scopes that a service needs automatically
    // update from defaults on every deploy.
    userConfig.auth.static_clients.push({
      clientId: client.clientId,
      accessToken,
    });

    // Now we update the per-service configs (other than root client obviously)
    if (client.clientId === 'static/taskcluster/root') {
      continue;
    }
    const serviceName = client.clientId.split('static/taskcluster/')[1].replace(/-/g, '_');
    userConfig[serviceName] = userConfig[serviceName] || {};
    userConfig[serviceName].taskcluster_access_token = accessToken;
  }

  return userConfig;
};
