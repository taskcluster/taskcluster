import assert from 'assert';
import helper from './helper.js';
import assume from 'assume';
import taskcluster from '@taskcluster/client';
import testing from '@taskcluster/lib-testing';

helper.secrets.mockSuite(testing.suiteName(), ['azure', 'gcp'], function(mock, skipping) {
  helper.withCfg(mock, skipping);
  helper.withDb(mock, skipping);
  helper.withPulse(mock, skipping);
  helper.withServers(mock, skipping);

  suite('charlene creates permanent credentials for a test runner', function() {
    suiteSetup(async function() {
      if (skipping()) {
        this.skip();
      } else {
        await helper.apiClient.deleteRole('client-id:test-users/test');
        await helper.apiClient.deleteClient('test-users');
        await helper.apiClient.deleteClient('test-users/charlene/travis-tests');
      }
    });

    // NOTE: these tests run in order
    let identityProvider,
      identityProviderToken,
      charlene,
      travisTests;

    test('add a client for the identity provider', async () => {
      let idp = await helper.apiClient.createClient('test-users', {
        description: 'Test users identity provider',
        expires: taskcluster.fromNow('2 hours'),
        scopes: [
          'auth:create-client:test-users/*',
          'auth:update-client:test-users/*',
          'auth:enable-client:test-users/*',
          'auth:disable-client:test-users/*',
          'auth:delete-client:test-users/*',
          'auth:reset-access-token:test-users/*',
          'assume:test-role:*',
        ],
      });

      identityProviderToken = idp.accessToken;
      identityProvider = new helper.AuthClient({
        rootUrl: helper.rootUrl,
        credentials: {
          clientId: 'test-users',
          accessToken: identityProviderToken,
        },
      });
    });

    test('add role3', async () => {
      await helper.apiClient.createRole('test-role:role3', {
        description: 'role 3',
        scopes: ['scope3a', 'scope3b'],
      });
    });

    test('create temporary credentials for charlene\'s browser login', async () => {
      charlene = new helper.AuthClient({
        rootUrl: helper.rootUrl,
        credentials: taskcluster.createTemporaryCredentials({
          start: new Date(),
          expiry: taskcluster.fromNow('1 hour'),
          credentials: {
            clientId: 'test-users',
            accessToken: identityProviderToken,
          },
          scopes: [
            'auth:create-client:test-users/charlene/*',
            'auth:update-client:test-users/charlene/*',
            'auth:delete-client:test-users/charlene/*',
            'auth:reset-access-token:test-users/charlene/*',
            'assume:test-role:role1',
            'assume:test-role:role2',
            'scope3a',
          ],
        }),
      });
    });

    test('charlene creates permanent credentials for her tests', async () => {
      let travisClient = await charlene.createClient('test-users/charlene/travis-tests', {
        description: 'Permacred created by test',
        expires: taskcluster.fromNow('3 hours'), // N.B. longer than temp creds
        scopes: [
          'assume:test-role:role1',
        ],
      });

      travisTests = new helper.AuthClient({
        rootUrl: helper.rootUrl,
        credentials: {
          clientId: 'test-users/charlene/travis-tests',
          accessToken: travisClient.accessToken,
        },
      });
    });

    // test some access-control

    test('charlene tries to grant role3 (which she does not have) to her client', async () => {
      try {
        await charlene.updateClient('test-users/charlene/travis-tests', {
          description: 'Permacred created by test',
          expires: taskcluster.fromNow('3 hours'),
          scopes: [
            'assume:test-role:role1',
            'assume:test-role:role3',
          ],
        });
        throw new Error('did not get expected error');
      } catch (err) {
        assume(err.statusCode).to.equal(403);
      }
    });

    test('charlene grants role2 and removes role1', async () => {
      let newClient = await charlene.updateClient('test-users/charlene/travis-tests', {
        description: 'Permacred created by test',
        expires: taskcluster.fromNow('3 hours'),
        scopes: [
          'assume:test-role:role2',
        ],
      });
      assume(newClient.scopes).to.contain('assume:test-role:role2');
    });

    test('root grants role3', async () => {
      await helper.apiClient.updateClient('test-users/charlene/travis-tests', {
        description: 'Permacred created by test',
        expires: taskcluster.fromNow('3 hours'),
        scopes: [
          'assume:test-role:role2',
          'assume:test-role:role3',
        ],
      });
    });

    test('charlene revokes role3', async () => {
      await charlene.updateClient('test-users/charlene/travis-tests', {
        description: 'Permacred created by test',
        expires: taskcluster.fromNow('3 hours'),
        scopes: [
          'assume:test-role:role2',
        ],
      });
    });

    test('root grants role3 again', async () => {
      await helper.apiClient.updateClient('test-users/charlene/travis-tests', {
        description: 'Permacred created by test',
        expires: taskcluster.fromNow('3 hours'),
        scopes: [
          'assume:test-role:role3',
        ],
      });
    });

    test('charlene replaces role3 with one of its constituent scopes', async () => {
      await charlene.updateClient('test-users/charlene/travis-tests', {
        description: 'Permacred created by test',
        expires: taskcluster.fromNow('3 hours'),
        scopes: [
          'scope3a',
        ],
      });
    });

    test('A disabled travis-tests client can\'t do things anymore', async function() {
      // give the user a scope we can use as a probe
      await helper.apiClient.updateClient('test-users/charlene/travis-tests', {
        description: 'Permacred created by test',
        expires: taskcluster.fromNow('3 hours'),
        scopes: [
          'auth:delete-client:test-users/charlene/travis-tests/*',
        ],
      });

      // should succeed
      await travisTests.deleteClient('test-users/charlene/travis-tests/foo');

      // disable
      await identityProvider.disableClient('test-users/charlene/travis-tests');

      // should fail
      await travisTests.deleteClient('test-users/charlene/travis-tests/foo').then(() => {
        assert(false, 'expected an error!');
      }, err => {
        assert(err.statusCode === 401, 'expected 401');
      });

      // enable
      await identityProvider.enableClient('test-users/charlene/travis-tests');

      // should succeed
      await travisTests.deleteClient('test-users/charlene/travis-tests/foo');
    });

  });
});
