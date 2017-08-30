import User from './../user';
import assert from 'assert';
import _ from 'lodash';
import jwt from 'jsonwebtoken';
import expressJwt from 'express-jwt';
import jwks from 'jwks-rsa';
import Debug from 'debug';
import auth0js from 'auth0-js';
import request from 'superagent';

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
    this._managementApi = new auth0js.Management({
      domain: this.domain,
      token: token,
    });
    this._managementApiExp = expires;

    return this._managementApi;
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

    // for the moment, we require the `full-user-credentials` scope, because
    // that's the only one.  This allows us to later add other scopes and
    // deprecate this one.
    let scopes = req.user.scope ? req.user.scope.split(' ') : [];
    if (!scopes.includes('full-user-credentials')) {
      debug(`request did not have the 'full-user-credentials' scope; had ${req.user.scope}`);
      return;
    }

    let a0 = await this.getManagementApi();
    let profile = await new Promise((resolve, reject) =>
      a0.getUser(req.user.sub, (err, prof) => err ? reject(err) : resolve(prof)));

    if ('active' in profile && !profile.active) {
      debug('user is not active; rejecting');
      return;
    }

    let user = userFromProfile(profile);
    user.expires = new Date(req.user.exp * 1000);
    return user;
  }

  userFromProfile(profile) {
    let user = new User();

    // we recognize a few different kinds of 'identities' that auth0 can send
    // our way.  Each of these translates into a different identityProviderId,
    // which authorizers will later use to figure out what scopes this user
    // has.  We do not ever expect to have more than one identity in this array,
    // in a practical sense.
    for (let {provider, connection} of profile.identities) {
      // The 'Mozilla-LDAP' connection corresponds to an LDAP login. For this
      // login, emails are a unique identifier
      if (provider === 'ad' && connection === 'Mozilla-LDAP') {
        if (profile.email_verified) {
          user.identity = 'mozilla-ldap/' + profile.email;
          break;
        }
      // The 'email' connection corresponds to a passwordless login.
      } else if (provider === 'email' && connection === 'email') {
        if (profile.email_verified) {
          user.identity = 'email/' + profile.email;
          break;
        }
      // Login with google really only gives us an email, too.
      } else if (provider === 'google-oauth2' && connection === 'google-oauth2') {
        if (profile.email_verified) {
          user.identity = 'email/' + profile.email;
          break;
        }
      // Github logins take the nickname from the profile; we don't get a reliable
      // email
      } else if (provider === 'github' && connection === 'github') {
        user.identity = 'github/' + profile.nickname;
      }
    }
    if (!user.identity) {
      debug('No recognized identity providers');
      return;
    }

    return user;
  }
}

export default Handler;
