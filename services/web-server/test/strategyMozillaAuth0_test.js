const assert = require('assert');
const testing = require('taskcluster-lib-testing');
const Strategy = require('../src/login/strategies/mozilla-auth0');

suite(testing.suiteName(), () => {
  let strategy = new Strategy({
    name: 'mozilla-auth0',
    cfg: {
      login: {
        strategies: {
          'mozilla-auth0': {
            domain: 'login-test.taskcluster.net',
            clientId: 'abcd',
            clientSecret: 'efgh',
            scope: 'taskcluster',
          },
        },
      },
    },
  });

  strategy.getPersonApi = () => {
    // Simulate linked identities by including all of them here
    const identities = [
      { provider: 'ad', connection: 'Mozilla-LDAP' },
      { provider: 'github', connection: 'github', user_id: 1234 },
      { provider: 'oauth2', connection: 'firefoxaccounts' },
      { provider: 'email', connection: 'email', user_id: 'slashy/slashy' },
    ];

    return {
      getProfileFromUserId: (userId) => {
        switch (userId) {
          case 'ad|Mozilla-LDAP|dmitchell':
            return {
              user_id: { value: 'ad|Mozilla-LDAP|dmitchell' },
              access_information: {},
              identities,
            };
          case 'github|1234':
            return {
              user_id: { value: 'github|1234' },
              access_information: {},
              nickname: 'helfi92',
              identities,
            };
          case 'oauth2|firefoxaccounts|abcdef':
            return {
              user_id: { value: 'oauth2|firefoxaccounts|abcdef' },
              access_information: {},
              email: 'rockets@ksc',
              fxa_sub: 'abcdef',
              identities,
            };
          case 'email|slashy/slashy':
            return {
              user_id: { value: 'email|slashy/slashy' },
              access_information: {},
              identities,
            };
          default:
            return null;
        }
      },
    };
  };

  suite('userFromClientId - simple LDAP profile', () => {
    const testUserFromClientId = ({ name, identity, clientId }) => {
      test(name, async function() {
        const result = await strategy.userFromClientId(clientId);

        console.log('result: ', result);

        assert.deepEqual(result, { _identity: identity, roles: [] });
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
      assert.deepEqual(await strategy.userFromClientId('no-slashes'), undefined);
    });
  });
});
