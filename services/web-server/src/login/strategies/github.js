const assert = require('assert');
const Debug = require('debug');
const passport = require('passport');
const { Strategy } = require('passport-github');
const taskcluster = require('taskcluster-client');
const User = require('../User');
const identityFromClientId = require('../../utils/identityFromClientId');
const tryCatch = require('../../utils/tryCatch');
const { decode, encode } = require('../../utils/codec');
const login = require('../../utils/login');
const jwt = require('../../utils/jwt');

const debug = Debug('strategies.github');

module.exports = class Github {
  constructor({ name, cfg }) {
    const strategyCfg = cfg.login.strategies[name];

    assert(strategyCfg.clientId, `${name}.clientId is required`);
    assert(strategyCfg.clientSecret, `${name}.clientSecret is required`);

    Object.assign(this, strategyCfg);

    this.jwt = cfg.login.jwt;
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

  async userFromToken(token) {
    const [jwtError, jwtResponse] = await tryCatch(
      jwt.verify({ publicKey: this.jwt.publicKey, token })
    );

    if (jwtError) {
      debug(`error validating jwt: ${jwtError}`);
      return;
    }

    debug(`received valid access_token for subject ${jwtResponse.sub}`);

    const [err, user] = await tryCatch(this.userFromClientId(jwtResponse.sub));

    if (err) {
      debug(`error retrieving user profile from the jwt sub field: ${err}\n${err.stack}`);
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
            privateKey: this.jwt.privateKey,
            identity: user.identity,
            // GitHub tokens don't expire
            exp: Math.floor(taskcluster.fromNow('1000 year').getTime() / 1000),
          });

          next(null, {
            profile,
            providerExpires,
            accessToken: taskclusterToken,
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
