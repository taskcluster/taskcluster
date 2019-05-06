const DataLoader = require('dataloader');
const WebServerError = require('../utils/WebServerError');

module.exports = (clients, isAuthed, rootUrl, monitor, strategies, req, cfg) => {
  const getCredentials = new DataLoader(queries => {
    return Promise.all(
      queries.map(async ({ provider, accessToken }) => {
        const strategy = strategies[provider];

        if (!strategy) {
          throw new WebServerError('InputError', `Could not find a strategy for provider ${provider}`);
        }

        const user = await strategy.userFromToken(accessToken);

        if (!user) {
          // Don't report much to the user, to avoid revealing sensitive information, although
          // it is likely in the service logs.
          throw new WebServerError('InputError', 'Could not generate credentials for this access token');
        }

        // Create and return temporary credentials, limiting expires to a max of 15 minutes
        const { credentials: issuer, temporaryCredentials: { startOffset } } = cfg.taskcluster;
        const { credentials: userCredentials, expires } = user.createCredentials({
          // issuer
          credentials: issuer,
          startOffset,
          expiry: '15 minutes',
        });
        // Move expires back by 30 seconds to ensure the user refreshes well in advance of the
        // actual credential expiration time
        expires.setSeconds(expires.getSeconds() - 30);

        monitor.log.createCredentials({
          clientId: userCredentials.clientId,
        });

        return {
          credentials: userCredentials,
          expires,
        };
      })
    );
  });

  return {
    getCredentials,
  };
};
