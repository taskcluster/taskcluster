const DataLoader = require('dataloader');
const Debug = require('debug');
const WebServerError = require('../utils/WebServerError');
const regenerateSession = require('../utils/regenerateSession');

const debug = Debug('loaders.auth');

module.exports = (clients, isAuthed, rootUrl, monitor, strategies, req, cfg) => {
  const getCredentials = new DataLoader(queries => {
    return Promise.all(
      queries.map(async () => {
        // Don't report much to the user, to avoid revealing sensitive information, although
        // it is likely in the service logs.
        const credentialError = new WebServerError('InputError', 'Could not generate credentials for this user');
        const unauthorizedError = new WebServerError('Unauthorized', 'Authentication is required to generate credentials');

        if (!req.user) {
          throw unauthorizedError;
        }

        const provider = req.user.identityProviderId;
        const strategy = strategies[provider];

        if (!strategy) {
          throw credentialError;
        }

        const user = await strategy.userFromIdentity(req.user.identity);

        if (!user) {
          debug(`Could not find user with identity ${req.user.identity}`);
          throw credentialError;
        }

        // Create and return temporary credentials, limiting expires to a max of 15 minutes
        const { credentials: issuer, temporaryCredentials: { startOffset } } = cfg.taskcluster;
        const { credentials: userCredentials, expires } = user.createCredentials({
          // issuer
          credentials: issuer,
          startOffset,
          expiry: '15 minutes',
        });

        await regenerateSession(req);

        // Move expires back by 30 seconds to ensure the user refreshes well in advance of the
        // actual credential expiration time
        expires.setSeconds(expires.getSeconds() - 30);

        monitor.log.createCredentials({
          clientId: userCredentials.clientId,
          expires,
          userIdentity: user.identity,
        });

        return {
          credentials: userCredentials,
          expires,
        };
      })
    );
  });

  const isLoggedIn = new DataLoader(queries =>
    Promise.all(
      queries.map(() => Boolean(req.user))
    )
  );

  return {
    getCredentials,
    isLoggedIn,
  };
};
