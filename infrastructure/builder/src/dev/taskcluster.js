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

    userConfig.auth.static_clients.push({
      ...client,
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

  // The following are some hacks for now until we can do all of this in a
  // nicer way (presumably?)
  userConfig['hooks']['hook_table_name'] = 'Hooks';
  userConfig['hooks']['lastfire_table_name'] = 'LastFire';
  userConfig['hooks']['queue_table_name'] = 'HooksQueue';
  userConfig['secrets']['azure_table_name'] = 'Secrets';
  userConfig['notify']['denylisted_notification_table_name'] = 'Denylist';
  userConfig['worker_manager']['providers'] = {};
  // TODO: Figure out what any of these should be set to
  userConfig['web_server']['public_url'] = (answer.rootUrl || userConfig.rootUrl).replace(/\/$/, '');
  userConfig['web_server']['additional_allowed_cors_origin'] = '???';
  userConfig['web_server']['ui_login_strategies'] = {};
  userConfig['web_server']['jwt_key'] = '???';
  //TODO: These github things can/should be questions in this setup thing
  userConfig['github']['bot_username'] = '???';
  userConfig['github']['github_private_pem'] = '???';
  userConfig['github']['github_app_id'] = '???';
  userConfig['github']['webhook_secret'] = [];

  return userConfig;
};
