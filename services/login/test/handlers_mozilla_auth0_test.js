const assume = require('assume');
const helper = require('./helper');
const Handler = require('../src/handlers/mozilla-auth0');

suite('handlers/mozilla-auth0', function() {
  suite('userFromProfile', function() {
    let handler = new Handler({
      name: 'mozilla-auth0',
      cfg: {
        handlers: {
          'mozilla-auth0': {
            domain:'login-test.taskcluster.net', 
            apiAudience: 'login-test.taskcluster.net',
            clientId: 'abcd',
            clientSecret: 'defg',
          },
        },
      },
    });

    test('user for ldap profile', function() {
      let user = handler.userFromProfile({
        email: 'foo@mozilla.com',
        email_verified: true,
        identities: [{provider: 'ad', connection: 'Mozilla-LDAP'}],
      });
      assume(user.identity).to.equal('mozilla-ldap/foo@mozilla.com');
    });

    test('user for email profile', function() {
      let user = handler.userFromProfile({
        email: 'foo@bar.com',
        email_verified: true,
        identities: [{provider: 'email', connection: 'email'}],
      });
      assume(user.identity).to.equal('email/foo@bar.com');
    });

    test('user for google profile', function() {
      let user = handler.userFromProfile({
        email: 'foo@bar.com',
        email_verified: true,
        identities: [{
          provider: 'google-oauth2',
          connection: 'google-oauth2'}],
      });
      assume(user.identity).to.equal('email/foo@bar.com');
    });

    test('user for github profile', function() {
      let user = handler.userFromProfile({
        nickname: 'octocat',
        identities: [{provider: 'github', connection: 'github'}],
      });
      assume(user.identity).to.equal('github/octocat');
    });
  });
});
