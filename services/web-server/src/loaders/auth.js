const DataLoader = require('dataloader');
const Debug = require('debug');
const WebServerError = require('../utils/WebServerError');
const tryCatch = require('../utils/tryCatch');
const jwt = require('../utils/jwt');

const debug = Debug('loaders.auth');

module.exports = (clients, isAuthed, rootUrl, monitor, strategies, req, cfg) => {
  const getCredentials = new DataLoader(queries => {
    return Promise.all(
      queries.map(async taskclusterToken => {
        // Don't report much to the user, to avoid revealing sensitive information, although
        // it is likely in the service logs.
        const credentialError = new WebServerError('InputError', 'Could not generate credentials for this access token');
        const [jwtError, jwtResponse] = await tryCatch(
          jwt.verify({
            publicKey: cfg.login.jwt.publicKey,
            token: taskclusterToken,
            options: {
              audience: rootUrl,
              issuer: rootUrl,
            },
          })
        );

        if (jwtError) {
          debug(`error validating jwt: ${jwtError}`);
          // Don't report much to the user, to avoid revealing sensitive information, although
          // it is likely in the service logs.
          throw credentialError;
        }

        debug(`received valid access_token for subject ${jwtResponse.sub}`);

        const provider = jwtResponse.sub.split('/')[0];
        const strategy = strategies[provider];

        if (!strategy) {
          throw credentialError;
        }

        const user = await strategy.userFromIdentity(jwtResponse.sub);

        if (!user) {
          debug(`Could not find user with identity ${jwtResponse.sub}`);
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

  return {
    getCredentials,
  };
};
