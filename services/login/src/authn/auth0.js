import express from 'express'
import Auth0Strategy from 'passport-auth0'
import passport from 'passport'
import assert from 'assert'
import User from './../user'
import url from 'url';

class Auth0Login {
  constructor(options) {
    assert(options, 'options are required');
    assert(options.cfg, 'options.cfg is required');
    assert(options.cfg.auth0, 'options.cfg.auth0 is required');
    assert(options.cfg.auth0.domain, 'options.cfg.auth0.domain is required');
    assert(options.cfg.auth0.clientId, 'options.cfg.auth0.clientId is required');
    assert(options.cfg.auth0.clientSecret, 'options.cfg.auth0.clientSecret is required');
    assert(options.authorize, 'options.authorize is required');

    this.cfg = options.cfg;
    this.authorize = options.authorize;

    passport.use(new Auth0Strategy({
      domain: options.cfg.auth0.domain,
      clientID: options.cfg.auth0.clientId,
      clientSecret: options.cfg.auth0.clientSecret,
      callbackURL: url.resolve(options.cfg.server.publicUrl, '/auth0/login'),
    }, this.auth0Callback.bind(this)));
  }

  router() {
    let router = new express.Router();

    console.log('setting up auth0/login');
    router.get('/login', passport.authenticate('auth0', {
      failureRedirect: '/',
      failureFlash: true
    }), (req, res) => {
      res.redirect('/');
      return;
    });

    return router;
  };

  // for the moment, we *only* support email login with Auth0.
  auth0Callback(accessToken, refreshToken, extraParams, profile, done) {
    try {
      let user = new User();
      console.log(profile._json);
      if (!profile._json.email_verified) {
        throw new Error('email is not verified');
      }
      user.identity = 'email/' + profile._json.email;
      this.authorize(user, done);
    } catch (err) {
      done(err, null);
    }
  }
}

module.exports = Auth0Login;

