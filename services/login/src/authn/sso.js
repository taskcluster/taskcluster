import express from 'express'
import saml from 'passport-saml'
import passport from 'passport'
import assert from 'assert'
import User from './../user'

class SSOLogin {
  constructor(options) {
    assert(options, 'options are required');
    assert(options.cfg, 'options.cfg is required');
    assert(options.cfg.sso, 'options.cfg.sso is required');
    assert(options.cfg.sso.issuer, 'options.cfg.sso.issuer is required');
    assert(options.cfg.sso.entryPoint, 'options.cfg.sso.entryPoint is required');
    assert(options.cfg.sso.certificate, 'options.cfg.sso.certificate is required');
    assert(options.authorize, 'options.authorize is required');

    this.authorize = options.authorize;

    passport.use(new saml.Strategy({
      issuer: options.cfg.sso.issuer,
      path: '/sso/login',
      entryPoint: options.cfg.sso.entryPoint,
      cert: options.cfg.sso.certificate,
      skipRequestCompression: true,
      passReqToCallback: true
    }, this.samlCallback.bind(this)));
  }

  router() {
    let router = new express.Router();
    router.post('/login', passport.authenticate('saml', {
      successRedirect: '/',
      failureRedirect: '/',
      failureFlash: true
    }));
    return router;
  };

  async samlCallback(req, profile, done) {
    console.log(this.authorize);
    try {
      let user = User.get(req);
      user.identity = 'sso/' + profile['ldap-email'];
      this.authorize(user, done);
    } catch (err) {
      done(err, null);
    }
  }
}

module.exports = SSOLogin;
