suite('user stories', function() {
  var Promise     = require('promise');
  var assert      = require('assert');
  var debug       = require('debug')('test:client');
  var helper      = require('./helper');
  var slugid      = require('slugid');
  var _           = require('lodash');
  var assume      = require('assume');
  var base        = require('taskcluster-base');
  var taskcluster = require('taskcluster-client');

  suite("charlene creates permanent credentials for a test runner", function() {
    let cleanup = async () => {
      await helper.auth.deleteRole('client-id:test-users/test');
      await helper.auth.deleteClient('test-users');
      await helper.auth.deleteClient('test-users/charlene/travis-tests');
    };
    before(cleanup);

    // NOTE: these tests run in order
    var identityProvider,
        identityProviderToken,
        charlene,
        travisTests;

    test("add a client for the identity provider", async () => {
      let idp = await helper.auth.createClient('test-users', {
        description: "Test users identity provider",
        expires: taskcluster.fromNow("2 hours"),
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
      identityProvider = new helper.Auth({
        credentials: {
          clientId: 'test-users',
          accessToken: identityProviderToken
        }
      });
    });

    test("add role3", async () => {
      await helper.auth.createRole('test-role:role3', {
        description: "role 3",
        scopes: ['scope3a', 'scope3b'],
      });
    });

    test("create temporary credentials for charlene's browser login", async () => {
      charlene = new helper.Auth({
        credentials: taskcluster.createTemporaryCredentials({
          start: new Date(),
          expiry: taskcluster.fromNow("1 hour"),
          credentials: {
            clientId: 'test-users',
            accessToken: identityProviderToken
          },
          scopes: [
            'auth:create-client:test-users/charlene/*',
            'auth:update-client:test-users/charlene/*',
            'auth:delete-client:test-users/charlene/*',
            'auth:reset-access-token:test-users/charlene/*',
            'assume:test-role:role1',
            'assume:test-role:role2',
          ],
        }),
      });
    });

    test("charlene creates permanent credentials for her tests", async () => {
      let travisClient = await charlene.createClient('test-users/charlene/travis-tests', {
        description: "Permacred created by test",
        expires: taskcluster.fromNow("3 hours"), // N.B. longer than temp creds
        scopes: [
          'assume:test-role:role1',
        ],
      });

      travisTests = new helper.Auth({
        credentials: {
          clientId: 'test-users/charlene/travis-tests',
          accessToken: travisClient.accessToken
        }
      });
    });

    // test some access-control

    test("charlene tries to grant role3 (which she does not have) to her client", async () => {
      try {
        await charlene.updateClient('test-users/charlene/travis-tests', {
          description: "Permacred created by test",
          expires: taskcluster.fromNow("3 hours"),
          scopes: [
            'assume:test-role:role1',
            'assume:test-role:role3',
          ],
        });
        throw new Error("did not get expected error");
      } catch (err) {
        assume(err.statusCode).to.equal(401);
      }
    });

    test("charlene grants role2 and removes role1", async () => {
      let newClient = await charlene.updateClient('test-users/charlene/travis-tests', {
        description: "Permacred created by test",
        expires: taskcluster.fromNow("3 hours"),
        scopes: [
          'assume:test-role:role2',
        ],
      });
      assume(newClient.scopes).to.contain('assume:test-role:role2');
    });

    test("root grants role3", async () => {
      let newClient = await helper.auth.updateClient('test-users/charlene/travis-tests', {
        description: "Permacred created by test",
        expires: taskcluster.fromNow("3 hours"),
        scopes: [
          'assume:test-role:role2',
          'assume:test-role:role3',
        ],
      });
    });

    test("charlene revokes role3", async () => {
      let newClient = await charlene.updateClient('test-users/charlene/travis-tests', {
        description: "Permacred created by test",
        expires: taskcluster.fromNow("3 hours"),
        scopes: [
          'assume:test-role:role2',
        ],
      });
    });

    test("root grants role3 again", async () => {
      let newClient = await helper.auth.updateClient('test-users/charlene/travis-tests', {
        description: "Permacred created by test",
        expires: taskcluster.fromNow("3 hours"),
        scopes: [
          'assume:test-role:role3',
        ],
      });
    });

    // TODO: bug 1242473
    test.skip("charlene replaces role3 with one of its constituent scopes", async () => {
      let newClient = await charlene.updateClient('test-users/charlene/travis-tests', {
        description: "Permacred created by test",
        expires: taskcluster.fromNow("3 hours"),
        scopes: [
          'scope3a',
        ],
      });
    });

    test("A disabled travis-tests client can't do things anymore", async function() {
      // give the user a scope we can use as a probe
      await helper.auth.updateClient('test-users/charlene/travis-tests', {
        description: "Permacred created by test",
        expires: taskcluster.fromNow("3 hours"),
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
        assert(false, "expected an error!");
      }, err => {
        assert(err.statusCode === 401, "expected 401");
      });

      // enable
      await identityProvider.enableClient('test-users/charlene/travis-tests');

      // should succeed
      await travisTests.deleteClient('test-users/charlene/travis-tests/foo');
    });

  });
});
