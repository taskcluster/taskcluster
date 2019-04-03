const assume = require('assume');
const Handler = require('../src/handlers/mozilla-auth0');
const testing = require('taskcluster-lib-testing');

suite(testing.suiteName(), function() {
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
    // simulate linked identities by including all of them here
    const identities = [
      {provider: 'ad', connection: 'Mozilla-LDAP'},
      {provider: 'github', connection: 'github', user_id: 1234},
      {provider: 'oauth2', connection: 'firefoxaccounts'},
      {provider: 'email', connection: 'email', user_id: 'slashy/slashy'},
    ];
    return {
      getUser: ({id}) => {
        switch (id) {
        case 'ad|Mozilla-LDAP|dmitchell':
          return {
            user_id: 'ad|Mozilla-LDAP|dmitchell',
            identities,
          };
        case 'github|1234':
          return {
            user_id: 'github|1234',
            nickname: 'helfi92',
            identities,
          };
        case 'oauth2|firefoxaccounts|abcdef':
          return {
            user_id: 'oauth2|firefoxaccounts|abcdef',
            email: 'rockets@ksc',
            fxa_sub: 'abcdef',
            identities,
          };
        case 'email|slashy/slashy':
          return {
            user_id: 'email|slashy/slashy',
            identities,
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
      clientId: 'mozilla-auth0/oauth2|firefoxaccounts|abcdef|rockets@ksc/',
      identity: 'mozilla-auth0/oauth2|firefoxaccounts|abcdef|rockets@ksc',
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
