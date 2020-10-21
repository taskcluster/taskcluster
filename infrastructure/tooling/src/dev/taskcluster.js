const slugid = require('slugid');
const _ = require('lodash');

module.exports = async ({ userConfig, answer, configTmpl }) => {

  function setDefault(path, val) {
    if (!_.has(userConfig, path, val)) {
      _.set(userConfig, path, val);
    }
  }

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
    let accessToken = slugid.v4() + slugid.v4();
    if (oldClients[client.clientId]) {
      accessToken = oldClients[client.clientId].accessToken;
    }

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

  const rootUrl = answer.rootUrl || userConfig.rootUrl;

  // The following are some hacks for now until we can do all of this in a
  // nicer way (presumably?)

  setDefault('worker_manager.providers', {});

  // TODO: Figure out what any of these should be set to
  setDefault('web_server.public_url', rootUrl);
  setDefault('web_server.additional_allowed_cors_origin', '');
  setDefault('web_server.ui_login_strategies', {});
  setDefault('web_server.session_secret', slugid.v4());

  //TODO: These github things can/should be questions in this setup thing
  setDefault('github.bot_username', '???');
  setDefault('github.github_private_pem', '???');
  setDefault('github.github_app_id', '???');
  setDefault('github.webhook_secret', []);

  // TODO: This eventually should just build these from rootUrl itself probably
  setDefault('ui.graphql_subscription_endpoint', `${rootUrl}/subscription`);
  setDefault('ui.graphql_endpoint', `${rootUrl}/graphql`);

  return userConfig;
};
