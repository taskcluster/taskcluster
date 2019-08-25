const assert = require('assert');
const Debug = require('debug');
const passport = require('passport');
const { Strategy } = require('passport-github');
const taskcluster = require('taskcluster-client');
const User = require('../User');
const identityFromClientId = require('../../utils/identityFromClientId');
const login = require('../../utils/login');
const WebServerError = require('../../utils/WebServerError');
const tryCatch = require('../../utils/tryCatch');
const { encode, decode } = require('../../utils/codec');
const GithubClient = require('../clients/GithubClient');

const debug = Debug('strategies.github');

module.exports = class Github {
  constructor({ name, cfg }) {
    const strategyCfg = cfg.login.strategies[name];

    assert(strategyCfg.clientId, `${name}.clientId is required`);
    assert(strategyCfg.clientSecret, `${name}.clientSecret is required`);

    Object.assign(this, strategyCfg);

    this.rootUrl = cfg.taskcluster.rootUrl;
    this.identityProviderId = 'github';
    this.githubClient = new GithubClient();
  }

  async getUser({ username, userId }) {
    const user = new User();
    const [githubErr, githubUser] = await tryCatch(this.githubClient.userFromUsername(username));

    if (githubErr) {
      debug(`error retrieving user data from Github: ${githubErr}\n${githubErr.stack}`);

      return;
    }

    if (githubUser.id !== userId) {
      debug(`Github user id ${githubUser.id} does not match userId ${userId} from the identity.`);

      return;
    }

    user.identity = `${this.identityProviderId}/${userId}|${encode(username)}`;

    if (!user.identity) {
      debug('No recognized identity providers');
      return;
    }

    // take a user and attach roles to it
    // this.addRoles(userProfile, user);

    return user;
  }

  userFromIdentity(identity) {
    const [userId, username = ''] = identity.split('/')[1].split('|');

    return this.getUser({ username: decode(username), userId: Number(userId) });
  }

  userFromClientId(clientId) {
    const identity = identityFromClientId(clientId);

    if (!identity) {
      return;
    }

    return this.userFromIdentity(identity);
  }

  useStrategy(app, cfg) {
    const { credentials } = cfg.taskcluster;
    const strategyCfg = cfg.login.strategies['github'];
    const loginMiddleware = login(cfg.app.publicUrl);

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
          const user = await this.getUser({ username: profile.username, userId: Number(profile.id) });

          if (!user) {
            // Don't report much to the user, to avoid revealing sensitive information, although
            // it is likely in the service logs.
            next(new WebServerError('InputError', 'Could not generate credentials for this access token'));
          }

          const exp = Math.floor(taskcluster.fromNow('30 days').getTime() / 1000);

          next(null, {
            profile,
            providerExpires: new Date(exp * 1000),
            identityProviderId: 'github',
            identity: user.identity,
          });
        }
      )
    );
    app.get('/login/github', passport.authenticate('github'));
    app.get(
      callback,
      passport.authenticate('github'),
      loginMiddleware
    );
  }
};
