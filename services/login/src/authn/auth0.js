const express = require('express');
const Auth0Strategy = require('passport-auth0');
const passport = require('passport');
const assert = require('assert');
const User = require('./../user');
const url = require('url');

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
      callbackURL: url.resolve(options.cfg.server.publicUrl, '/auth0/callback'),
    }, this.auth0Callback.bind(this)));
  }

  router() {
    let router = new express.Router();

    // render the Jade template that shows the email-only lock on get
    router.get('/login', (req, res) => {
      res.render('auth0', {
        auth0_domain: this.cfg.auth0.domain,
        auth0_client_id: this.cfg.auth0.clientId,
      });
    });

    // similarly, but when not coming from the tools site
    router.get('/login-local', (req, res) => {
      req.session['auth0-local'] = 1;
      res.render('auth0', {
        auth0_domain: this.cfg.auth0.domain,
        auth0_client_id: this.cfg.auth0.clientId,
      });
    });

    // similarly, but use the hosted lock to temporarily allow LDAP
    router.post('/login-temp', (req, res) => {
      req.session['auth0-local'] = 1;
      res.redirect('/auth0/callback');
    });

    // this path will either handle a callback from the lock in the Jade
    // template, or a callback from the hosted lock (allowing LDAP login).  In
    // either case, req.user has been set up already.
    router.get('/callback', passport.authenticate('auth0', {
    }), (req, res) => {
      // if this was a local request, just go back to /
      if (req.session['auth0-local']) {
        delete req.session['auth0-local'];
        res.redirect('/');
        return;
      }

      // only do this once..
      delete req.session['auth0-local'];

      // generate temporary credentials and send them back to tools in a URL query
      let {credentials} = req.user.createCredentials(this.cfg.app.temporaryCredentials);
      var querystring = [];
      querystring.push('clientId=' + encodeURIComponent(credentials.clientId));
      querystring.push('accessToken=' + encodeURIComponent(credentials.accessToken));
      querystring.push('certificate=' + encodeURIComponent(credentials.certificate));
      querystring = querystring.join('&');

      let url = `https://tools.taskcluster.net/login/?${querystring}`;
      res.redirect(url);
    });

    return router;
  };

  auth0Callback(accessToken, refreshToken, extraParams, profile, done) {
    // Support both email and LDAP logins.  This is a bit of a cheat until everything
    // is using OIDC, and unfortunately gives LDAP logins full 3-day temporary credentials
    try {
      let user = new User();

      if (!profile._json.email_verified) {
        throw new Error('email is not verified');
      }

      let {provider, connection} = profile.identities[0];
      // The 'Mozilla-LDAP' connection corresponds to an LDAP login. For this
      // login, emails are a unique identifier
      if (provider === 'ad' && connection === 'Mozilla-LDAP') {
        user.identity = 'mozilla-ldap/' + profile._json.email;
      // The 'email' connection corresponds to a passwordless login.
      } else if (provider === 'email' && connection === 'email') {
        user.identity = 'email/' + profile._json.email;
      } else {
        throw new Error('unrecognized identity');
      }

      this.authorize(user, done);
    } catch (err) {
      done(err, null);
    }
  }
}

module.exports = Auth0Login;

