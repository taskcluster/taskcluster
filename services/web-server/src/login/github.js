import passport from 'passport';
import { Strategy } from 'passport-github';
import { createTemporaryCredentials, fromNow } from 'taskcluster-client';

export default (app, cfg) => {
  if (!cfg.githubLogin.clientId || !cfg.githubLogin.clientSecret) {
    throw new Error(
      'Unable to use "github" login strategy without client ID or secret'
    );
  }

  const callback = '/login/github/callback';

  passport.use(
    new Strategy(
      {
        clientID: cfg.githubLogin.clientId,
        clientSecret: cfg.githubLogin.clientSecret,
        callbackURL: `${cfg.app.publicUrl}${callback}`,
      },
      (accessToken, refreshToken, profile, next) => {
        const expires = fromNow('7 days');
        const identity = `github/${encodeURIComponent(profile.id)}|${
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
