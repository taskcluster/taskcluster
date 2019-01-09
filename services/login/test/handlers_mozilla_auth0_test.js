const assume = require('assume');
const Handler = require('../src/handlers/mozilla-auth0');
const {encode} = require('../src/utils');

suite('handlers/mozilla-auth0', function() {
  let handler = new Handler({
    name: 'mozilla-auth0',
    cfg: {
      handlers: {
        'mozilla-auth0': {
          domain: 'login-test.taskcluster.net',
          apiAudience: 'login-test.taskcluster.net',
          clientId: 'abcd',
          clientSecret: 'defg',
        },
      },
    },
  });
  handler.getManagementApi = () => {
    return {
      getUser: ({id}) => {
        switch (id) {
        case 'LDAP':
          return {};
        case 'github':
          return {};
        default:
          return {};
        }
      },
    };
  };

  suite('conversions', function() {
    const testClientId = (name, {clientId, userId, identity}) => {
      test(name, function() {
        assume(handler.userIdFromClientId(clientId)).to.equal(userId);
        assume(handler.identityFromClientId(clientId)).to.equal(identity);
      });
    };

    const testProfile = (name, {profile, identity}) => {
      test(name, function() {
        assume(handler.identityFromProfile(profile)).to.equal(identity);
        const clientId = `${identity}/abc`;
        assume(handler.identityFromClientId(clientId)).to.equal(identity);
      });
    };

    testClientId('simple LDAP clientId', {
      clientId: 'mozilla-auth0/ad|Mozilla-LDAP|dmitchell/abc',
      userId: 'ad|Mozilla-LDAP|dmitchell',
      identity: 'mozilla-auth0/ad|Mozilla-LDAP|dmitchell',
    });

    testClientId('simple LDAP clientId with just a trailing /', {
      clientId: 'mozilla-auth0/ad|Mozilla-LDAP|dmitchell/',
      userId: 'ad|Mozilla-LDAP|dmitchell',
      identity: 'mozilla-auth0/ad|Mozilla-LDAP|dmitchell',
    });

    testClientId('github clientId', {
      clientId: 'mozilla-auth0/github|1234|helfi92/',
      userId: 'github|1234',
      identity: 'mozilla-auth0/github|1234|helfi92',
    });

    testClientId('firefoxaccounts clientId', {
      clientId: 'mozilla-auth0/oauth2|firefoxaccounts|abcdef|djmitche/',
      userId: 'oauth2|firefoxaccounts|abcdef',
      identity: 'mozilla-auth0/oauth2|firefoxaccounts|abcdef|djmitche',
    });

    testClientId('encoded clientId', {
      clientId: 'mozilla-auth0/email|slashy!2Fslashy/abc',
      userId: 'email|slashy/slashy',
      identity: 'mozilla-auth0/email|slashy!2Fslashy',
    });

    testProfile('simple LDAP profile', {
      profile: {
        user_id: 'ad|Mozilla-LDAP|dmitchell',
        identities: [{provider: 'ad', connection: 'Mozilla-LDAP'}],
      },
      identity: 'mozilla-auth0/ad|Mozilla-LDAP|dmitchell',
    });

    testProfile('email profile with slashes', {
      profile: {
        user_id: 'email|slashy/slashy',
        identities: [{provider: 'email', connection: 'email'}],
      },
      identity: 'mozilla-auth0/email|slashy!2Fslashy',
    });

    testProfile('google profile', {
      profile: {
        user_id: 'google-oauth2|392759287359',
        identities: [{provider: 'google-oauth2', connection: 'google-oauth2'}],
      },
      identity: 'mozilla-auth0/google-oauth2|392759287359',
    });

    testProfile('github profile', {
      profile: {
        nickname: 'helfi92',
        user_id: 'github|1234',
        identities: [{provider: 'github', connection: 'github'}],
      },
      identity: 'mozilla-auth0/github|1234|helfi92',
    });

    testProfile('firefoxaccounts profile', {
      profile: {
        nickname: 'fxsync',
        user_id: 'oauth2|firefoxaccounts|01290ca01be',
        identities: [{provider: 'oauth2', connection: 'firefoxaccounts'}],
      },
      identity: 'mozilla-auth0/oauth2|firefoxaccounts|01290ca01be|fxsync',
    });

    test('userIdFromClientId with non-matching clientId', function() {
      assume(handler.userIdFromClientId('no-slashes')).to.equal(undefined);
    });
  });

  suite('userFromProfile', function() {
    test('user for ldap profile', function() {
      const user_id = 'ad|Mozilla-LDAP|foo';
      const user = handler.userFromProfile({
        email: 'foo@mozilla.com',
        email_verified: true,
        user_id,
        identities: [{provider: 'ad', connection: 'Mozilla-LDAP'}],
      });

      assume(user.identity).to.equal(`mozilla-auth0/${encode(user_id)}`);
    });

    test('user for email profile', function() {
      const user_id = 'email|foo';
      const user = handler.userFromProfile({
        email: 'foo@bar.com',
        email_verified: true,
        user_id,
        identities: [{provider: 'email', connection: 'email'}],
      });

      assume(user.identity).to.equal(`mozilla-auth0/${encode(user_id)}`);
    });

    test('user for google profile', function() {
      const user_id = 'google|foo';
      const user = handler.userFromProfile({
        email: 'foo@bar.com',
        email_verified: true,
        user_id,
        identities: [{provider: 'google-oauth2', connection: 'google-oauth2'}],
      });

      assume(user.identity).to.equal(`mozilla-auth0/${encode(user_id)}`);
    });

    test('user for github profile', function() {
      const user_id = 'github|0000';
      const user = handler.userFromProfile({
        nickname: 'octocat',
        user_id,
        identities: [{provider: 'github', connection: 'github'}],
      });

      assume(user.identity).to.equal(`mozilla-auth0/${encode(user_id)}|octocat`);
    });

    test('user with user_id for which encoding is not identity', () => {
      ['abc@gmail.com|0000|test', 'abc@gmail.com|0000%2F|test']
        .forEach(user_id => {
          const user = handler.userFromProfile({
            email: 'abc@gmail.com',
            email_verified: true,
            user_id,
            identities: [{provider: 'google-oauth2', connection: 'google-oauth2'}],
          });

          assume(user.identity).to.equal(`mozilla-auth0/${encode(user_id)}`);
        });
    });
  });
});
