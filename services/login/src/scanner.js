const taskcluster = require('taskcluster-client');
const scopeUtils = require('taskcluster-lib-scopes');
const {CLIENT_ID_PATTERN} = require('./utils');
const Debug = require('debug');

const debug = Debug('scanner');

async function scanner(cfg, handlers) {
  // * get the set of identityProviderIds
  // * for each:
  //   * fetch all clients
  //   * for each identity:
  //     * get roles from providers, expand
  //     * for each client in that identity:
  //       * get, verify client.expandedScopes satisfied by identity's expandedScopes

  // NOTE: this function performs once auth operation at a time.  It is better
  // for scans to take longer than for the auth service to be overloaded.
  let auth = new taskcluster.Auth({
    credentials: cfg.app.credentials,
    rootUrl: cfg.taskcluster.rootUrl,
  });

  const scan = async h => {
    const handler = handlers[h];
    let clients = [];
    const query = {prefix: `${handler.identityProviderId}/`};
    // get all Clients
    while (true) {
      const clientResponse = await auth.listClients(query);
      query.continuationToken = clientResponse.continuationToken;
      clients = clients.concat(clientResponse.clients);
      if (!query.continuationToken) {
        break;
      }
    }

    // iterate through the clients, constructing a new User as necessary, comparing
    // the client's scopes to the User's scopes and disabling where necessary.
    let user, userScopes;

    for (let client of clients) {
      debug('examining client', client.clientId);

      const patternMatch = client.clientId.match(CLIENT_ID_PATTERN);

      if (!patternMatch || client.disabled) {
        continue;
      }

      const identity = patternMatch && patternMatch[1];

      if (!user || user.identity !== identity) {
        user = await handler.userFromClientId(client.clientId);

        if (!user) {
          continue;
        }

        userScopes = (await auth.expandScopes({scopes: user.scopes()})).scopes;

        debug('..against user', user.identity);
      }

      // if this client's expandedScopes are not satisfied by the user's expanded
      // scopes, disable the client.
      if (!scopeUtils.scopeMatch(userScopes, [client.expandedScopes])) {
        await auth.disableClient(client.clientId);
      }
    }
  };

  await Promise.all(
    Object
      .keys(cfg.handlers)
      .map(scan),
  );
}

module.exports = scanner;
