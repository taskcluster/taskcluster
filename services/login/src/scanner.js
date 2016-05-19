import taskcluster from 'taskcluster-client'
import scopeUtils from 'taskcluster-lib-scopes'
import User from './user'
import _ from 'lodash'
var debug = require('debug')('scanner');

export default async function scanner(cfg, authorizer) {
  // * get the set of identityProviderIds
  // * for each:
  //   * fetch all clients, sort by identity
  //   * for each identity:
  //     * get roles from providers, expand
  //     * for each client in that identity:
  //       * get, verify client.expandedScopes satisfied by identity's expandedScopes

  // NOTE: this function performs once auth operation at a time.  It is better
  // for scans to take longer than for the auth service to be overloaded.
  let auth = new taskcluster.Auth({credentials: cfg.app.credentials});

  // gather all identityProviderIds used in any authorizer
  let identityProviders = authorizer.identityProviders;

  // enumerate all clients for any of those identity providers
  let clients = [];
  for (let idp of identityProviders) {
    clients = clients.concat(await auth.listClients({prefix: idp + "/"}));
  }

  // sort by clientId, so that each identity (a prefix of the clientId) appears
  // contiguously
  clients = _.sortBy(clients, 'clientId');

  // iterate through the clients, constructing a new User as necessary, comparing
  // the client's scopes to the User's scopes and disabling where necessary.
  let user, userScopes;
  let idPattern = /^([^\/]*\/[^\/]*)\/.+$/
  for (let client of clients.sort()) {
    debug("examining client", client.clientId);
    if (!client.clientId.match(idPattern) || client.disabled) {
      continue;
    }

    // refresh the user if it does not correspond to this client
    let clientIdentity = client.clientId.replace(idPattern, '$1');
    if (!user || user.identity != clientIdentity) {
      user = new User();
      user.identity = clientIdentity;

      await authorizer.authorize(user);

      userScopes = (await auth.expandScopes({scopes: user.scopes()})).scopes;
      // allow the implicit 'assume:client-id:<clientId> auth adds for each client
      userScopes.push('assume:client-id:' + clientIdentity + '/*');

      debug("..against user", user.identity);
    }

    // if this client's expandedScopes are not satisfied by the user's expanded
    // scopes, disable the client.
    if (!scopeUtils.scopeMatch(userScopes, [client.expandedScopes])) {
      await auth.disableClient(client.clientId);
    }
  }
}
