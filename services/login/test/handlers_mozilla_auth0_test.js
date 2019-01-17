const assume = require('assume');
const Handler = require('../src/handlers/mozilla-auth0');

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
        case 'ad|Mozilla-LDAP|dmitchell':
          return {
            identities: [{provider: 'ad', connection: 'Mozilla-LDAP'}],
            user_id: 'ad|Mozilla-LDAP|dmitchell',
          };
        case 'github|1234':
          return {
            identities: [{provider: 'github', connection: 'github'}],
            user_id: 'github|1234',
            nickname: 'helfi92',
          };
        case 'oauth2|firefoxaccounts|abcdef':
          return {
            user_id: 'oauth2|firefoxaccounts|abcdef',
            identities: [{provider: 'oauth2', connection: 'firefoxaccounts'}],
            nickname: 'djmitche',
          };
        case 'email|slashy/slashy':
          return {
            user_id: 'email|slashy/slashy',
            identities: [{provider: 'email', connection: 'email'}],
          };
        default:
          return null;
        }
      },
    };
  };

  suite('userFromClientId - simple LDAP profile', function() {
    const testUserFromClientId = ({name, identity, clientId}) => {
      test(name, async function() {
        assume(await handler.userFromClientId(clientId)).deep.equals({ _identity: identity, roles: [] });
      });
    };

    testUserFromClientId({
      name: 'simple LDAP clientId',
      identity: 'mozilla-auth0/ad|Mozilla-LDAP|dmitchell',
      clientId: 'mozilla-auth0/ad|Mozilla-LDAP|dmitchell/abc',
    });

    testUserFromClientId({
      name: 'simple LDAP clientId with just a trailing /',
      identity: 'mozilla-auth0/ad|Mozilla-LDAP|dmitchell',
      clientId: 'mozilla-auth0/ad|Mozilla-LDAP|dmitchell/',
    });

    testUserFromClientId({
      name: 'github clientId',
      clientId: 'mozilla-auth0/github|1234|helfi92/',
      identity: 'mozilla-auth0/github|1234|helfi92',
    });

    testUserFromClientId({
      name: 'firefoxaccounts clientId',
      clientId: 'mozilla-auth0/oauth2|firefoxaccounts|abcdef|djmitche/',
      identity: 'mozilla-auth0/oauth2|firefoxaccounts|abcdef|djmitche',
    });

    testUserFromClientId({
      name: 'encoded clientId',
      clientId: 'mozilla-auth0/email|slashy!2Fslashy/abc',
      identity: 'mozilla-auth0/email|slashy!2Fslashy',
    });

    test('userIdFromClientId with non-matching clientId', async function() {
      assume(await handler.userFromClientId('no-slashes')).to.equal(undefined);
    });
  });
});
