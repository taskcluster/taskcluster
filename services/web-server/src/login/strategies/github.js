const assert = require('assert');
const Debug = require('debug');
const passport = require('passport');
const { Strategy } = require('passport-github');
const taskcluster = require('taskcluster-client');
const User = require('../User');
const identityFromClientId = require('../../utils/identityFromClientId');
const { encode, decode } = require('../../utils/codec');
const login = require('../../utils/login');
const jwt = require('../../utils/jwt');

const debug = Debug('strategies.github');

module.exports = class Github {
  constructor({ name, cfg }) {
    const strategyCfg = cfg.login.strategies[name];

    assert(strategyCfg.clientId, `${name}.clientId is required`);
    assert(strategyCfg.clientSecret, `${name}.clientSecret is required`);

    Object.assign(this, strategyCfg);

    this.jwtConfig = cfg.login.jwt;
    this.rootUrl = cfg.taskcluster.rootUrl;
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

  userFromIdentity(identity) {
    const encodedUserId = identity.split('/')[1];
    const userId = decode(encodedUserId);

    return this.getUser({ userId });
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
          const user = await this.getUser({ userId: profile.username });
          const { token: taskclusterToken, expires: providerExpires } = jwt.generate({
            rootUrl: this.rootUrl,
            key: this.jwtConfig.key,
            sub: user.identity,
            exp: Math.floor(taskcluster.fromNow('30 days').getTime() / 1000),
          });

          next(null, {
            profile,
            providerExpires,
            taskclusterToken,
            identityProviderId: 'github',
          });
        }
      )
    );
    app.get('/login/github', passport.authenticate('github', { session: false }));
    app.get(
      callback,
      passport.authenticate('github', { session: false }),
      loginMiddleware
    );
  }
};
