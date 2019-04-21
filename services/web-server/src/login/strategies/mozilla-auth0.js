const passport = require('passport');
const Auth0Strategy = require('passport-auth0');
const WebServerError = require('../../utils/WebServerError');

export default ({ app, cfg, handlers }) => {
  const { credentials } = cfg.taskcluster;
  const handler = handlers['mozilla-auth0'];
  const handlerCfg = cfg.login.handlers['mozilla-auth0'];

  if (!credentials || !credentials.clientId || !credentials.accessToken) {
    throw new Error(
      'Unable to use "mozilla-auth0" login strategy without taskcluster clientId and accessToken'
    );
  }

  const callback = '/login/auth0/callback';

  passport.use(
    new Auth0Strategy(
      {
        domain: handlerCfg.domain,
        clientID: handlerCfg.clientId,
        clientSecret: handlerCfg.clientSecret,
        audience: handlerCfg.audience,
        scope: handlerCfg.scope,
        callbackURL: `${cfg.app.publicUrl}${callback}`,
      },
      // accessToken is the token to call Auth0 API (not needed in most cases)
      // extraParams.id_token has the JSON Web Token
      // profile has all the information from the user
      async (accessToken, refreshToken, extraParams, profile, done) => {
        const user = await handler.getUser({ userId: profile.user_id });

        if (!user) {
          // Don't report much to the user, to avoid revealing sensitive information, although
          // it is likely in the service logs.
          throw new WebServerError('InputError', 'Could not generate credentials for this access token');
        }

        const { credentials: issuer, startOffset } = cfg.taskcluster.temporaryCredentials;
        const { credentials, expires } = user.createCredentials({
          credentials: issuer,
          startOffset,
          expiry: '7 days',
        });

        // Move expires back by 30 seconds to ensure the user refreshes well in advance of the
        // actual credential expiration time
        expires.setSeconds(expires.getSeconds() - 30);

        done(null, {
          credentials,
          expires,
          profile,
          identityProviderId: 'mozilla-auth0',
        });
      }
    )
  );

  // Called by the consumer
  app.get('/login/mozilla-auth0', passport.authenticate('auth0'));
  // Called by the provider
  app.get(
    callback,
    passport.authenticate('auth0'),
    (request, response) => {
      response.render('callback', {
        user: request.user,
      });
    }
  );
};
