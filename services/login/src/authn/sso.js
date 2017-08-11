import express from 'express';
import saml from 'passport-saml';
import passport from 'passport';
import assert from 'assert';
import User from './../user';

class SSOLogin {
  constructor(options) {
    assert(options, 'options are required');
    assert(options.cfg, 'options.cfg is required');
    assert(options.cfg.sso, 'options.cfg.sso is required');
    assert(options.cfg.sso.issuer, 'options.cfg.sso.issuer is required');
    assert(options.cfg.sso.entryPoint, 'options.cfg.sso.entryPoint is required');
    assert(options.cfg.sso.certificate, 'options.cfg.sso.certificate is required');
    assert(options.authorize, 'options.authorize is required');

    this.cfg = options.cfg;
    this.authorize = options.authorize;

    passport.use(new saml.Strategy({
      issuer: options.cfg.sso.issuer,
      path: '/sso/login',
      entryPoint: options.cfg.sso.entryPoint,
      cert: options.cfg.sso.certificate,
      skipRequestCompression: true,
      passReqToCallback: true,
    }, this.samlCallback.bind(this)));
  }

  router() {
    let router = new express.Router();

    /* This is a bit tangled.  There's the "old way" and the "new way" and
     * they all use /login.  There is an ultimate goal, so this tangled mess
     * won't live forever.
     *
     * Old:
     *   Clicking "Sign-In With Okta" on the *login* site POSTS to /login
     *   Passport redirects to Okta
     *   Okta POSTs back to /login
     *   samlCallback, below, creates a User object and makes a cookie
     *   Passport redirects to /
     *   The HTML at / sees that the requester was tools, and redirects
     *     there via window.location
     *
     * New:
     *   Clicking "Sign-In with Okta" on the *tools* site links to GET /login
     *   That route sets a cookie to indicate the new way and redirects to
     *      the Okta endpoint
     *   Okta POSTs back to /login
     *   Handler sees the new-way cookie, clears it, and redirects back to tools
     *
     * Ultimate Goal:
     *   Clicking "Sign-In with Okta" on the *tools* site links to GET /login
     *   That route redirects to Okta
     *   Okta POSTS to /login
     *   That processes the SAML and redirects (success or failure) to tools
     */

    // the form on the login landing page POSTs, and the SSO service
    // POSTs back here
    router.post('/login', passport.authenticate('saml', {
      // NOTE: Okta handles most errors internally -- I don't know how to reproduce
      // this failureRedirect
      failureRedirect: '/',
      failureFlash: true,
    }), (req, res) => {
      if (!req.session['new-way']) {
        res.redirect('/');
        return;
      }

      // only do this once..
      delete req.session['new-way'];

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

    // but tc-tools sends the browser to GET this URL
    router.get('/login', (req, res) => {
      // redirect to the login URL.  This will eventually POST back to
      // the /login route, above, which 
      req.session['new-way'] = 1;
      res.redirect(this.cfg.sso.entryPoint);
    });

    return router;
  };

  samlCallback(req, profile, done) {
    try {
      let user = User.get(req);
      // note that we use the same identity prefix as the ldap authz as these
      // currently have the same backend (Mozilla LDAP).
      user.identity = 'mozilla-ldap/' + profile['ldap-email'];
      this.authorize(user, done);
    } catch (err) {
      done(err, null);
    }
  }
}

module.exports = SSOLogin;
