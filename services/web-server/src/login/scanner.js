import scopeUtils from 'taskcluster-lib-scopes';
import Debug from 'debug';
import identityFromClientId from '../utils/identityFromClientId.js';

const debug = Debug('scanner');

export default async (auth, strategies) => {
  async function scan(strategy) {
    const clients = [];
    const query = { prefix: `${strategy.identityProviderId}/` };

    // Get all clients
    while (true) {
      const clientResponse = await auth.listClients(query);

      query.continuationToken = clientResponse.continuationToken;

      if (clientResponse.clients.length) {
        clients.push(...(clientResponse.clients));
      }

      if (!query.continuationToken) {
        break;
      }
    }

    if (!clients.length) {
      return;
    }

    // Iterate through the clients, constructing a new User as necessary, comparing
    // the client's scopes to the User's scopes and disabling where necessary.
    let user, userScopes;

    for (const client of clients) {
      debug('examining client', client.clientId);

      const identity = identityFromClientId(client.clientId);

      if (!identity || client.disabled) {
        continue;
      }

      if (!user || user.identity !== identity) {
        user = await strategy.userFromIdentity(identity);

        if (!user) {
          // this user has been deleted, so disable the client
          try {
            await auth.disableClient(client.clientId);
          } catch (err) {
            if (err.statusCode !== 404) {
              throw err;
            }
            // 404's are OK - it means the user was deleted (even better than
            // disabled) between the auth.listClients call and the
            // auth.disableClient call.
          }
          continue;
        }

        userScopes = (await auth.expandScopes({ scopes: [...user.scopes(), 'assume:anonymous'] })).scopes;

        debug('..against user', user.identity);
      }

      // if this client's expandedScopes are not satisfied by the user's expanded
      // scopes, disable the client.
      if (!scopeUtils.satisfiesExpression(userScopes, { AllOf: client.expandedScopes })) {
        await auth.disableClient(client.clientId);
      }
    }
  }

  await Promise.all(
    Object
      .values(strategies)
      .map(scan),
  );
};
