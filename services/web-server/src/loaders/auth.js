const DataLoader = require('dataloader');
const WebServerError = require('../utils/WebServerError');
const regenerateSession = require('../utils/regenerateSession');
const generateCredentials = require('../utils/generateCredentials');

module.exports = (clients, isAuthed, rootUrl, monitor, strategies, req, cfg) => {
  const getCredentials = new DataLoader(queries => {
    return Promise.all(
      queries.map(async () => {
        // Don't report much to the user, to avoid revealing sensitive information, although
        // it is likely in the service logs.
        const unauthorizedError = new WebServerError('Unauthorized', 'Authentication is required to generate credentials');

        if (!req.user) {
          throw unauthorizedError;
        }

        const credsResponse = await generateCredentials({
          cfg,
          strategy: strategies[req.user.identityProviderId],
          identity: req.user.identity,
          monitor,
        });

        await regenerateSession(req);

        return credsResponse;
      }),
    );
  });
  const isLoggedIn = new DataLoader(queries =>
    Promise.all(
      queries.map(() => Boolean(req.user)),
    ),
  );

  return {
    getCredentials,
    isLoggedIn,
  };
};
