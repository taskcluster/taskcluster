const taskcluster = require('taskcluster-client');
const oauth2orize = require('oauth2orize');
const _ = require('lodash');
const WebServerError = require('../utils/WebServerError');
const generateCredentials = require('../utils/generateCredentials');
const tryCatch = require('../utils/tryCatch');
const ensureLoggedIn = require('../utils/ensureLoggedIn');

module.exports = (cfg, AuthorizationCode, AccessToken, strategies, auth, monitor) => {
  // Create OAuth 2.0 server
  const server = oauth2orize.createServer();

  server.serializeClient((client, done) => done(null, client));
  server.deserializeClient((client, done) => done(null, client));

  function findRegisteredClient(clientId) {
    return cfg.login.registeredClients.find(client => client.clientId === clientId);
  }

  /**
   * Grant implicit authorization.
   *
   * The callback takes the `client` requesting authorization, the authenticated
   * `user` granting access, and their response, which contains approved scope,
   * duration, etc. as parsed by the application.  The application issues a token,
   * which is bound to these values.
   */
  server.grant(oauth2orize.grant.token(async (client, user, ares, areq, done) => {
    if (!_.isEqual(client.scope.sort(), areq.scope.sort())) {
      return done(new oauth2orize.AuthorizationError(null, 'invalid_scope'));
    }

    if (!client) {
      return done(new oauth2orize.AuthorizationError(null, 'unauthorized_client'));
    }

    if (!client.redirectUri.some(uri => uri === areq.redirectURI)) {
      return done(new oauth2orize.AuthorizationError(null, 'access_denied'));
    }

    if (client.responseType !== 'token') {
      return done(new oauth2orize.AuthorizationError(null, 'unsupported_response_type'));
    }

    const encodedAccessToken = new Buffer.from(user.accessToken).toString('base64');

    return done(null, encodedAccessToken);
  }));

  /**
   * Grant authorization codes
   *
   * The callback takes the `client` requesting authorization, the `redirectURI`
   * (which is used as a verifier in the subsequent exchange), the authenticated
   * `user` granting access, and their response, which contains approved scope,
   * duration, etc. as parsed by the application.  The application issues a code,
   * which is bound to these values, and will be exchanged for an access token.
   */
  server.grant(oauth2orize.grant.code(async (client, redirectURI, user, ares, areq, done) => {
    const code = taskcluster.slugid();
    const accessToken = taskcluster.slugid();

    if (!_.isEqual(client.scope.sort(), ares.scope.sort())) {
      return done(new oauth2orize.AuthorizationError(null, 'invalid_scope'));
    }

    if (!client) {
      return done(new oauth2orize.AuthorizationError(null, 'unauthorized_client'));
    }

    if (!client.redirectUri.some(uri => uri === redirectURI)) {
      return done(new oauth2orize.AuthorizationError(null, 'access_denied'));
    }

    if (client.responseType !== 'code') {
      return done(new oauth2orize.AuthorizationError(null, 'unsupported_response_type'));
    }

    await AuthorizationCode.create({
      code,
      // OAuth2 client
      clientId: client.clientId,
      redirectUri: redirectURI,
      identity: user.identity,
      identityProviderId: user.identityProviderId,
      accessToken,
      // A maximum of 10 minutes is recommended in https://tools.ietf.org/html/rfc6749#section-4.1.2
      expires: taskcluster.fromNow('10 minutes'),
    }, true);

    return done(null, code);
  }));

  /**
   * After a client has obtained an authorization grant from the user,
   * we exchange the authorization code for an access token.
   *
   * The callback accepts the `client`, which is exchanging `code` and any
   * `redirectURI` from the authorization request for verification.  If these values
   * are validated, the application issues a Taskcluster token on behalf of the user who
   * authorized the code.
   */
  server.exchange(oauth2orize.exchange.code(async (client, code, redirectURI, done) => {
    const entry = await AuthorizationCode.load({ code }, true);

    if (!entry) {
      return done(null, false);
    }

    if (redirectURI !== entry.redirectUri) {
      return done(null, false);
    }

    await AccessToken.create({
      // OAuth2 client
      clientId: entry.clientId,
      redirectUri: redirectURI,
      identity: entry.identity,
      identityProviderId: entry.identityProviderId,
      accessToken: entry.accessToken,
      // This table is used alongside the AuthorizationCode table which has a 10 minute recommended expiration
      expires: taskcluster.fromNow('10 minutes'),
    }, true);

    return done(null, entry.accessToken);
  }));

  const authorization = [
    ensureLoggedIn,
    server.authorization((clientID, redirectURI, scope, done) => {
      const client = findRegisteredClient(clientID);

      if (!client) {
        return done(null, false);
      }

      if (!client.redirectUri.some(uri => uri === redirectURI)) {
        return done(null, false);
      }

      if (client.whitelisted && !_.isEqual(scope.sort(), client.scope.sort())) {
        return done(null, false);
      }

      return done(null, client, redirectURI);
    }, async (client, user, scope, done) => {
      // Skip consent form if the client is whitelisted
      if (client.whitelisted && user && _.isEqual(client.scope.sort(), scope.sort())) {
        // Resetting the access token is the default behavior for whitelisted clients.
        // One less click in the UI.
        await auth.resetAccessToken(user.identity);

        return done(null, true, { scope });
      }

      return done(null, false);
    }),
    (req, res) => {
      const client = findRegisteredClient(req.query.client_id);
      let expires = client.maxExpires;

      if (req.query.expires) {
        try {
          if (new Date(taskcluster.fromNow(req.query.expires)) > new Date(taskcluster.fromNow(client.maxExpires))) {
            expires = client.maxExpires;
          } else {
            expires = req.query.expires;
          }
        } catch (e) {
          // req.query.expires was probably an invalid date.
          // We default to the max expiration time defined by the client.
        }
      }

      const query = new URLSearchParams({
        transactionID: req.oauth2.transactionID,
        client_id: req.query.client_id,
        expires,
        scope: req.query.scope,
      });

      res.redirect(`${cfg.app.publicUrl}/third-party?${query}`);
    },
    server.errorHandler({ mode: 'indirect' }),
  ];

  const decision = [
    ensureLoggedIn,
    server.decision((req, done) => {
      return done(null, { scope: req.body.scope ? req.body.scope.split(' ') : [] });
    }),
    server.errorHandler({ mode: 'indirect' }),
  ];

  /**
   * Token endpoint
   *
   * `token` middleware handles client requests to exchange
   * an authorization code for a Taskcluster token.
   */
  const token = [
    server.token(),
    server.errorHandler(),
  ];

  /**
   * Credential endpoint - Resource server
   *
   * The Taskcluster deployment acts as a "resource server" by serving Taskcluster
   * credentials given a valid OAuth2 access token.
   *
   * This is accomplished by calling the endpoint <root-url>/login/oauth/credentials with the header
   *    Authorization: Bearer <access-token>
   *
   * The response is a JSON body of the form:
   *
   * {
   *   "credentials": {
   *     "clientId": "...",
   *     "accessToken": "...",
   *   },
   *   "expires": "..."
   * }
   *
   *
   */
  const getCredentials = async (req, res, next) => {
    // Don't report much to the user, to avoid revealing sensitive information, although
    // it is likely in the service logs.
    const inputError = new WebServerError('InputError', 'Could not generate credentials for this access token');
    const { accessToken, params: { provider } } = req;

    const strategy = strategies[provider];
    const [tokenError, entry] = await tryCatch(AccessToken.load({ accessToken }));

    if (tokenError) {
      return next(inputError);
    }

    const [credsError, credentials] = await tryCatch(generateCredentials({
      cfg,
      strategy,
      identity: entry.identity,
      monitor,
    }));

    if (credsError) {
      return next(inputError);
    }

    res.send({
      expires: credentials.expires,
      credentials,
    });
  };

  return {
    authorization,
    decision,
    token,
    getCredentials,
  };
};
