import passport from 'passport';
import { Strategy } from 'passport-github';
import { createTemporaryCredentials, fromNow } from 'taskcluster-client';

export default app => {
  if (!process.env.GITHUB_CLIENT_ID || !process.env.GITHUB_CLIENT_SECRET) {
    throw new Error(
      'Unable to use "github" login strategy without GITHUB_CLIENT_ID ' +
        'and GITHUB_CLIENT_SECRET environment variables'
    );
  }

  const callback = '/login/github/callback';

  passport.use(
    new Strategy(
      {
        clientID: process.env.GITHUB_CLIENT_ID,
        clientSecret: process.env.GITHUB_CLIENT_SECRET,
        callbackURL: `${process.env.PUBLIC_URL}${callback}`,
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
          credentials: {
            clientId: process.env.TASKCLUSTER_CLIENT_ID,
            accessToken: process.env.TASKCLUSTER_ACCESS_TOKEN,
          },
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
