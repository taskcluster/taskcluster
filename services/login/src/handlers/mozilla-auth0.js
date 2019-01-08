const User = require('./../user');
const {encode, decode, CLIENT_ID_PATTERN} = require('../utils');
const assert = require('assert');
const _ = require('lodash');
const jwt = require('jsonwebtoken');
const expressJwt = require('express-jwt');
const jwks = require('jwks-rsa');
const Debug = require('debug');
const auth0 = require('auth0');
const request = require('superagent');

const debug = Debug('handlers.mozilla-auth0');

class Handler {
  constructor({name, cfg}) {
    let handlerCfg = cfg.handlers[name];
    assert(handlerCfg.domain, `${name}.domain is required`);
    assert(handlerCfg.apiAudience, `${name}.apiAudience is required`);
    assert(handlerCfg.clientId, `${name}.clientId is required`);
    assert(handlerCfg.clientSecret, `${name}.clientSecret is required`);
    _.assign(this, handlerCfg);

    // use express-jwt to validate JWTs against auth0
    this.jwtCheck = expressJwt({
      secret: jwks.expressJwtSecret({
        cache: true,
        rateLimit: true,
        jwksRequestsPerMinute: 5,
        jwksUri: `https://${this.domain}/.well-known/jwks.json`,
      }),
      // expect to see our audience in the JWT
      audience: this.apiAudience,
      // and expect a token issued by auth0
      issuer: `https://${this.domain}/`,
      algorithms: ['RS256'],
      credentialsRequired: true,
    });

    this._managementApiExp = null;
    this._managementApi = null;
    this._identityProviderId = 'mozilla-auth0';
  }

  get identityProviderId() {
    return this._identityProviderId;
  }

  // Get a management API instance, by requesting an API token as needed
  // see https://auth0.com/docs/api/management/v2/tokens
  async getManagementApi() {
    if (this._managementApi && new Date().getTime() / 1000 < this._managementApiExp - 10) {
      return this._managementApi;
    }

    let res = await request.post(`https://${this.domain}/oauth/token`)
      .set('content-type', 'application/json')
      .send({
        grant_type: 'client_credentials',
        client_id: this.clientId,
        client_secret: this.clientSecret,
        audience: `https://${this.domain}/api/v2/`,
      });

    let token = JSON.parse(res.text).access_token;
    if (!token) {
      throw new Error('did not receive a token from Auth0 /oauth/token endpoint');
    }

    // parse the token just enough to figure out when it expires
    let decoded = jwt.decode(token);
    let expires = decoded.exp;

    // create a new
    this._managementApi = new auth0.ManagementClient({
      domain: this.domain,
      token: token,
    });
    this._managementApiExp = expires;

    return this._managementApi;
  }

  async profileFromUserId(userId) {
    const a0 = await this.getManagementApi();

    const profile = new Promise((resolve, reject) =>
      a0.getUser(userId, (err, prof) => err ? reject(err) : resolve(prof)));

    return profile;
  }

  async userFromRequest(req, res) {
    // check the JWT's validity, setting req.user if sucessful
    try {
      await new Promise((resolve, reject) =>
        this.jwtCheck(req, res, (err) => err ? reject(err) : resolve()));
    } catch (err) {
      debug(`error validating jwt: ${err}`);
      return;
    }

    debug(`received valid access_token for subject ${req.user.sub}`);

    let scopes = req.user.scope ? req.user.scope.split(' ') : [];
    if (!scopes.includes('taskcluster-credentials')) {
      debug(`request did not have the 'taskcluster-credentials' scope; had ${req.user.scope}`);
      return;
    }

    try {
      const profile = await this.profileFromUserId(req.user.sub);

      if ('active' in profile && !profile.active) {
        debug('user is not active; rejecting');
        return;
      }

      const user = this.userFromProfile(profile);
      user.expires = new Date(req.user.exp * 1000);

      return user;
    } catch (err) {
      debug(`error retrieving profile from request: ${err}\n${err.stack}`);
      return;
    }
  }

  async userFromUserId(userId) {
    try {
      const profile = await this.profileFromUserId(userId);
      const user = this.userFromProfile(profile);

      return user;
    } catch (err) {
      debug(`error retrieving profile from userId: ${err}\n${err.stack}`);
      return;
    }
  }

  userFromClientId(clientId) {
    const userId = this.userIdFromClientId(clientId);
    if (!userId) {
      return;
    }

    return this.userFromUserId(userId);
  }

  identityFromClientId(clientId) {
    const patternMatch = CLIENT_ID_PATTERN.exec(clientId);
    return patternMatch && patternMatch[1];
  }

  userIdFromClientId(clientId) {
    const identity = this.identityFromClientId(clientId);

    if (!identity) {
      return;
    }

    let encodedUserId = identity.split('/')[1];

    // Reverse the username appending, stripping the username.
    if (encodedUserId.startsWith('github|') || encodedUserId.startsWith('oauth2|firefoxaccounts|')) {
      encodedUserId = encodedUserId.replace(/\|[^|]*$/, '');
    }

    return decode(encodedUserId);
  }

  identityFromProfile(profile) {
    let identity;

    // Look for a profile.identities element we recognize.  In practice, this is a one-element
    // array as we do not use Auth0 user linking.
    profile.identities.forEach(({provider, connection}) => {
      if (
        provider === 'ad' && connection === 'Mozilla-LDAP' ||
        // The 'email' connection corresponds to a passwordless login.
        provider === 'email' && connection === 'email' ||
        provider === 'google-oauth2' && connection === 'google-oauth2'
      ) {
        assert(!profile.user_id.startsWith('github|'));
        identity = `${this.identityProviderId}/${encode(profile.user_id)}`;
      // we annotate some userids with `|nickname` since otherwise the userid
      // is just numeric and difficult for humans to interpret
      } else if (provider === 'github' && connection === 'github') {
        assert(profile.user_id.startsWith('github|'));
        identity = `${this.identityProviderId}/${encode(profile.user_id)}|${profile.nickname}`;
      } else if (provider === 'oauth2' && connection === 'firefoxaccounts') {
        assert(profile.user_id.startsWith('oauth2|firefoxaccounts|'));
        identity = `${this.identityProviderId}/${encode(profile.user_id)}|${profile.nickname}`;
      }
    });

    return identity;
  }

  userFromProfile(profile) {
    const user = new User();

    user.identity = this.identityFromProfile(profile);
    if (!user.identity) {
      debug('No recognized identity providers');
      return;
    }

    // take a user and attach roles to it
    this.addRoles(profile, user);

    return user;
  }

  addRoles(profile, user) {
    const mozGroupPrefix = 'mozilliansorg_';
    const hrisGroupPrefix = 'hris_';
    const groups = Array.from(new Set([
      ...profile.groups || [],
      ...(profile.app_metadata || {}).groups || [],
    ]));

    // Non-prefixed groups are what is known as Mozilla LDAP groups. Groups prefixed by a provider
    // name and underscore are provided by a specific group engine. For example,
    // `providername_groupone` is provided by `providername`. Per https://goo.gl/bwWjvE.
    // For our own purposes, if the prefix is not mozilliansorg. then we treat it as an ldap group
    user.addRole(
      ...groups
        .filter(g => !g.startsWith(hrisGroupPrefix))
        .filter(g => !g.startsWith(mozGroupPrefix))
        .map(g => `mozilla-group:${g}`)
    );
    user.addRole(
      ...groups
        .filter(g => !g.startsWith(hrisGroupPrefix))
        .filter(g => g.startsWith(mozGroupPrefix))
        .map(g => g.slice(mozGroupPrefix.length))
        .map(g => `mozillians-group:${g}`)
    );
  }
}

module.exports = Handler;
