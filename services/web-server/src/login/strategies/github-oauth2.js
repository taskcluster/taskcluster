const assert = require('assert');
const Debug = require('debug');
const passport = require('passport');
const { Strategy } = require('passport-github');
const User = require('../User');
const identityFromClientId = require('../../utils/identityFromClientId');
const tryCatch = require('../../utils/tryCatch');
const { decode, encode } = require('../../utils/codec');
const { LOGIN_PROVIDERS } = require('../../utils/constants');
const credentialsQuery = require('../queries/Credentials.graphql').default;
const GithubClient = require('../clients/GithubClient');

const debug = Debug('strategies.github-oauth2');

module.exports = class GithubOauth2 {
  constructor({ name, cfg }) {
    const strategyCfg = cfg.login.strategies[name];

    assert(strategyCfg.clientId, `${name}.clientId is required`);
    assert(strategyCfg.clientSecret, `${name}.clientSecret is required`);

    Object.assign(this, strategyCfg);
    this.identityProviderId = 'github-oauth2';
  }

  async getUser({ userId }) {
    const user = new User();

    user.identity = `${this.identityProviderId}/${encode(userId)}`;

    if (!user.identity) {
      debug('No recognized identity providers');
      return;
    }

    // take a user and attach roles to it
    // this.addRoles(userProfile, user);

    return user;
  }

  async userFromToken(accessToken) {
    const githubClient = new GithubClient();
    const [githubErr, githubUser] = await tryCatch(githubClient.userFromToken(accessToken));

    if (githubErr) {
      debug(`error retrieving user data from Github: ${githubErr}\n${githubErr.stack}`);
    }

    const [err, user] = await tryCatch(this.getUser({ userId: githubUser.login }));

    if (err) {
      debug(`error retrieving user profile from the username: ${err}\n${err.stack}`);
      return;
    }

    return user;
  }

  userFromClientId(clientId) {
    const identity = identityFromClientId(clientId);

    if (!identity) {
      return;
    }

    const encodedUserId = identity.split('/')[1];

    return this.getUser({ userId: decode(encodedUserId) });
  }

  useStrategy(app, cfg, graphqlClient) {
    const { credentials } = cfg.taskcluster;
    const strategyCfg = cfg.login.strategies['github-oauth2'];

    if (!strategyCfg.clientId || !strategyCfg.clientSecret) {
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
          clientID: strategyCfg.clientId,
          clientSecret: strategyCfg.clientSecret,
          callbackURL: `${cfg.app.publicUrl}${callback}`,
        },
        async (accessToken, refreshToken, profile, next) => {
          const { data } = await graphqlClient({
            requestString: credentialsQuery,
            variableValues: {
              provider: LOGIN_PROVIDERS.GITHUB_OAUTH2,
              accessToken,
            },
          });
          const { credentials, expires } = data.getCredentials;

          next(null, {
            credentials,
            expires: new Date(expires),
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
  }
};
