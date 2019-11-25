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
          case 'ad|Mozilla-LDAP|tcperson':
            return {
              user_id: { value: 'ad|Mozilla-LDAP|tcperson' },
              access_information: {
                ldap: {
                  values: {
                    'taskcluster': null,
                  },
                },
              },
              identities,
            };
          case 'ad|Mozilla-LDAP|torperson':
            return {
              user_id: { value: 'ad|Mozilla-LDAP|torperson' },
              access_information: {
                hris: {
                  values: {
                    'office-tor': null,
                  },
                },
              },
              identities,
            };
          case 'ad|Mozilla-LDAP|mozillian':
            return {
              user_id: { value: 'ad|Mozilla-LDAP|mozillian' },
              access_information: {
                mozilliansorg: {
                  values: {
                    'foxy': null,
                  },
                },
              },
              identities,
            };
          case 'github|1234':
            return {
              user_id: { value: 'github|1234' },
              access_information: {},
              nickname: 'helfi92',
              identities,
            };
          case 'github|9999':
            return {
              active: false,
              user_id: { value: 'github|9999' },
              access_information: {},
              nickname: 'inactive',
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
          case 'oauth2|firefoxaccounts|noidentities':
            return {
              user_id: { value: 'oauth2|firefoxaccounts|noidentities' },
              access_information: {},
              email: 'rockets@ksc',
              fxa_sub: 'noidentities',
            };
          default:
            return null;
        }
      },
    };
  };

  suite('userFromIdentity', () => {
    test('LDAP and LDAP groups', async function() {
      const user = await strategy.userFromIdentity('mozilla-auth0/ad|Mozilla-LDAP|tcperson');
      assert.equal(user.identity, 'mozilla-auth0/ad|Mozilla-LDAP|tcperson');
      assert.deepEqual(user.roles, ['mozilla-group:taskcluster']);
    });

    test('LDAP and HRIS groups', async function() {
      const user = await strategy.userFromIdentity('mozilla-auth0/ad|Mozilla-LDAP|torperson');
      assert.equal(user.identity, 'mozilla-auth0/ad|Mozilla-LDAP|torperson');
      assert.deepEqual(user.roles, ['mozilla-hris:office-tor']);
    });

    test('LDAP and Mozillians groups', async function() {
      const user = await strategy.userFromIdentity('mozilla-auth0/ad|Mozilla-LDAP|mozillian');
      assert.equal(user.identity, 'mozilla-auth0/ad|Mozilla-LDAP|mozillian');
      assert.deepEqual(user.roles, ['mozillians-group:foxy']);
    });

    test('GitHub', async function() {
      const user = await strategy.userFromIdentity('mozilla-auth0/github|1234|helfi92');
      assert.equal(user.identity, 'mozilla-auth0/github|1234|helfi92');
      assert.deepEqual(user.roles, []);
    });

    test('GitHub with wrong username', async function() {
      const user = await strategy.userFromIdentity('mozilla-auth0/github|1234|OTHERNAME');
      assert.equal(user, undefined);
    });

    test('GitHub inactive', async function() {
      const user = await strategy.userFromIdentity('mozilla-auth0/github|9999|inactive');
      assert.equal(user, undefined);
    });

    test('Firefox Accounts', async function() {
      const user = await strategy.userFromIdentity('mozilla-auth0/oauth2|firefoxaccounts|abcdef|rockets@ksc');
      assert.equal(user.identity, 'mozilla-auth0/oauth2|firefoxaccounts|abcdef|rockets@ksc');
      assert.deepEqual(user.roles, []);
    });

    test('Firefox Accounts with wrong email', async function() {
      const user = await strategy.userFromIdentity('mozilla-auth0/oauth2|firefoxaccounts|abcdef|wizards@ksc');
      assert.equal(user, undefined);
    });

    test('Email (with a slash)', async function() {
      const user = await strategy.userFromIdentity('mozilla-auth0/email|slashy!2Fslashy');
      assert.equal(user.identity, 'mozilla-auth0/email|slashy!2Fslashy');
      assert.deepEqual(user.roles, []);
    });

    test('profile without identities should not return a user', async function() {
      const user = await strategy.userFromIdentity('mozilla-auth0/oauth2|firefoxaccounts|noidentities');

      assert.equal(user, null);
    });
  });
});
