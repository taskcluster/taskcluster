const assert = require('assert');
const Debug = require('debug');
const passport = require('passport');
const { Strategy } = require('passport-github');
const { createTemporaryCredentials, fromNow } = require('taskcluster-client');
const User = require('../User');
const { encode } = require('../../utils/codec');
const { CLIENT_ID_PATTERN } = require('../../utils/constants');

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

  async userFromRequest(req, res) {
    // TODO: return a user
    return;
  }

  // exposed method
  userFromClientId(clientId) {
    const patternMatch = CLIENT_ID_PATTERN.exec(clientId);
    const identity = patternMatch && patternMatch[1];

    if (!identity) {
      return;
    }

    // TODO: return a user
    return;
  }

  useStrategy(app, cfg) {
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
  }
};
