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

        // If req.user is falsy for one query, it will be falsy for the rest.
        // Instead of returning an error in the try catch block below for every query,
        // we just want to throw an unauthorized error
        if (!req.user) {
          throw unauthorizedError;
        }

        try {
          const credsResponse = await generateCredentials({
            cfg,
            strategy: strategies[req.user.identityProviderId],
            identity: req.user.identity,
            monitor,
          });

          await regenerateSession(req);

          return credsResponse;
        } catch (err) {
          return err;
        }
      }),
    );
  });

  const isLoggedIn = new DataLoader(queries =>
    Promise.all(
      queries.map(() => {
        return Boolean(req.user);
      }),
    ),
  );

  return {
    getCredentials,
    isLoggedIn,
  };
};
