import passport from 'passport';
import Auth0Strategy from 'passport-auth0';
import { createTemporaryCredentials, fromNow } from 'taskcluster-client';

export default (app, cfg) => {
  const { credentials } = cfg.taskcluster;

  ['domain', 'clientId', 'clientSecret', 'audience', 'scope'].forEach(prop => {
    if (!cfg.mozillaAuth0Login[prop]) {
      throw new Error(
        `Unable to use "mozilla-auth0" login strategy without a Mozilla Auth0 "${prop}"`
      );
    }
  });

  if (!credentials || !credentials.clientId || !credentials.accessToken) {
    throw new Error(
      'Unable to use "mozilla-auth0" login strategy without taskcluster clientId and accessToken'
    );
  }

  const callback = '/login/auth0/callback';

  passport.use(
    new Auth0Strategy(
      {
        domain: cfg.mozillaAuth0Login.domain,
        clientID: cfg.mozillaAuth0Login.clientId,
        clientSecret: cfg.mozillaAuth0Login.clientSecret,
        audience: cfg.mozillaAuth0Login.audience,
        scope: cfg.mozillaAuth0Login.scope,
        callbackURL: `${cfg.app.publicUrl}${callback}`,
      },
      (accessToken, refreshToken, extraParams, profile, done) => {
        const expires = fromNow('7 days');
        const identity = `mozilla-auth0/${encodeURIComponent(profile.id)}`;
        const credentials = createTemporaryCredentials({
          clientId: identity,
          start: fromNow(),
          expiry: expires,
          scopes: [`assume:login-identity:${identity}`],
          credentials: cfg.taskcluster.credentials,
        });

        done(null, {
          credentials,
          expires,
          profile,
          providerId: 'mozilla-auth0',
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
