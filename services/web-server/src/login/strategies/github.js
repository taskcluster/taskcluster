const assert = require('assert');
const Debug = require('debug');
const passport = require('passport');
const { Strategy } = require('passport-github');
const taskcluster = require('taskcluster-client');
const User = require('../User');
const identityFromClientId = require('../../utils/identityFromClientId');
const tryCatch = require('../../utils/tryCatch');
const { decode, encode } = require('../../utils/codec');
const GithubClient = require('../clients/GithubClient');

const debug = Debug('strategies.github');

module.exports = class Github {
  constructor({ name, cfg }) {
    const strategyCfg = cfg.login.strategies[name];

    assert(strategyCfg.clientId, `${name}.clientId is required`);
    assert(strategyCfg.clientSecret, `${name}.clientSecret is required`);

    Object.assign(this, strategyCfg);
    this.identityProviderId = 'github';
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

  useStrategy(app, cfg) {
    const { credentials } = cfg.taskcluster;
    const strategyCfg = cfg.login.strategies['github'];

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
          next(null, {
            profile,
            accessToken,
            identityProviderId: 'github',
            // GitHub tokens don't expire
            providerExpires: taskcluster.fromNow('1000 years'),
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
