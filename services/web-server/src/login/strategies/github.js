const passport = require('passport');
const { Strategy } = require('passport-github');
const { createTemporaryCredentials, fromNow } = require('taskcluster-client');

export default ({ app, cfg, handlers }) => {
  const { credentials } = cfg.taskcluster;
  const handlerCfg = cfg.login.handlers['github-oauth2'];

  if (!handlerCfg.clientId || !handlerCfg.clientSecret) {
    throw new Error(
      'Unable to use "github" login strategy without GitHub client ID or secret'
    );
  }

  if (!credentials || !credentials.clientId || !credentials.accessToken) {
    throw new Error(
      'Unable to use "github" login strategy without taskcluster clientId and accessToken'
    );
  }

  const callback = '/login/github/callback';

  passport.use(
    new Strategy(
      {
        clientID: handlerCfg.clientId,
        clientSecret: handlerCfg.clientSecret,
        callbackURL: `${cfg.app.publicUrl}${callback}`,
      },
      (accessToken, refreshToken, profile, next) => {
        const expires = fromNow('7 days');
        const identity = `github-oauth2/${encodeURIComponent(profile.id)}|${
          profile.username
        }`;
        const credentials = createTemporaryCredentials({
          clientId: identity,
          start: fromNow(),
          expiry: expires,
          scopes: [`assume:login-identity:${identity}`],
          credentials: cfg.taskcluster.credentials,
        });

        next(null, {
          credentials,
          expires,
          profile,
          identityProviderId: 'github-oauth2',
        });
      }
    )
  );
  app.get('/login/github', passport.authenticate('github', { session: false }));
  app.get(
    callback,
    passport.authenticate('github', { session: false }),
    (request, response) => {
      response.render('callback', {
        user: request.user,
      });
    }
  );
};
