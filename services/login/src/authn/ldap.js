import express from 'express'
import local from 'passport-local'
import passport from 'passport'
import assert from 'assert'
import User from './../user'
import LDAPClient from './../ldap';

class LDAPLogin {
  constructor(options) {
    assert(options, 'options are required');
    assert(options.cfg, 'options.cfg is required');
    assert(options.cfg.ldap, 'options.cfg.ldap is required');
    assert(options.cfg.ldap.url, 'options.cfg.ldap.url is required');
    assert(options.cfg.ldap.cert, 'options.cfg.ldap.cert is required');
    assert(options.cfg.ldap.key, 'options.cfg.ldap.key is required');
    assert(options.authorize, 'options.authorize is required');

    this.user = options.cfg.ldap.user;
    this.password = options.cfg.ldap.password;
    this.client = new LDAPClient(options.cfg.ldap);
    this.authorize = options.authorize;

    passport.use(new local.Strategy({
      passReqToCallback: true,
    }, (req, user, password, done) => {
          this.localCallback(req, user, password)
          .then((res) => done(null, res))
          .catch((err) => {
            console.log("Error authenticating local user", err.stack);
            done(null, false, {message: err.message});
          })
        }));
  }

  router() {
    let router = new express.Router();
    router.post('/login', passport.authenticate('local', {
      successRedirect: '/',
      failureRedirect: '/',
      failureFlash: true
    }));
    return router;
  };

  authFail() {
    // we do not want to distinguish no-such-user from bad-password, lest this
    // tool become an oracle for discovering valid usernames
    throw new Error("User not found or incorrect password");
  }

  async localCallback(req, email, password) {
    // bind as the bind user to convert email to DN
    let userDn = await this.client.bind(this.user, this.password,
        (client) => client.dnForEmail(email));
    if (!userDn) {
      return this.authFail();
    }

    // re-bind as the DN, to validate the password
    try {
      await this.client.bind(userDn, password);
    } catch(e) {
      return this.authFail();
    }

    // success!
    let user = User.get(req);
    user.identity = 'mozilla-ldap/' + email;
    await this.authorize(user);
    return user;
  }
}

module.exports = LDAPLogin;
