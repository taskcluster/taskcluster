const { Auth } = require('taskcluster-client');
const assert = require('assert');
const scan = require('../src/login/scanner');
const testing = require('taskcluster-lib-testing');
const libUrls = require('taskcluster-lib-urls');
const User = require('../src/login/User');
const identityFromClientId = require('../src/utils/identityFromClientId');

suite(testing.suiteName(), () => {
  // set up some fakes
  let clients = {};
  const auth = new Auth({
    rootUrl: libUrls.testRootUrl(),
    fake: {
      listClients: ({prefix, continuationToken}) => {
        // always return a single client, to test pagination, using the next
        // client name as the continuationToken
        let names = Object.keys(clients).filter(n => n.startsWith(prefix));
        if (continuationToken) {
          names = names.slice(names.findIndex(n => n === continuationToken));
        }
        if (names.length > 1) {
          continuationToken = names[1];
        }
        return {
          clients: [clients[names[0]]],
          continuationToken: names[1],
        };
      },
      expandScopes: ({scopes}) => ({
        scopes: [...new Set(scopes.concat(scopes.map(n => n.replace(/^assume:is:/, 'assume:also:'))))],
      }),
      disableClient: clientId => {
        clients[clientId].disabled = true;
      },
    },
  });

  const addClient = (clientId, expandedScopes, disabled = false) => {
    clients[clientId] = {clientId, disabled, expandedScopes};
  };

  setup(function() {
    clients = {};
  });

  class TestStrategy {
    constructor({name, cfg}) {
      this.identityProviderId = name;
    }

    userFromIdentity(identity) {
      const userId = identity.split('/')[1];
      // as a special case, there's no user NOSUCH
      if (userId === "NOSUCH") {
        return;
      }
      const user = new User();
      user.identity = identity;
      user.addRole('is:' + userId);
      return user;
    }

    userFromClientId(clientId) {
      const identity = identityFromClientId(clientId);
      return this.userFromIdentity(identity);
    }
  }

  const strategies = {test: new TestStrategy({name: 'test'})};

  test('test strategy with valid clients', async function() {
    addClient('test/user1/', ['assume:also:user1']);
    addClient('test/user1/another', ['assume:is:user1']);
    addClient('test/user2/hi', ['assume:also:user2']);
    addClient('test/user2/ho', ['assume:is:user2']);
    await scan(auth, strategies);
    assert.equal(clients['test/user1/'].disabled, false);
    assert.equal(clients['test/user1/another'].disabled, false);
    assert.equal(clients['test/user2/hi'].disabled, false);
    assert.equal(clients['test/user2/ho'].disabled, false);
  });

  test('test strategy with some invalid clients', async function() {
    addClient('test/user1/', ['assume:also:user1']);
    addClient('test/user1/another', ['assume:NOSUCH']);
    addClient('test/user2/hi', ['assume:also:user2']);
    addClient('test/user2/ho', ['assume:NOSUCH']);
    await scan(auth, strategies);
    assert.equal(clients['test/user1/'].disabled, false);
    assert.equal(clients['test/user1/another'].disabled, true);
    assert.equal(clients['test/user2/hi'].disabled, false);
    assert.equal(clients['test/user2/ho'].disabled, true);
  });

  test('test strategy with some clients that have no user', async function() {
    addClient('test/user1/x', ['assume:is:user1']);
    addClient('test/NOSUCH/hi', ['assume:NOSUCH']);
    await scan(auth, strategies);
    assert.equal(clients['test/user1/x'].disabled, false);
    assert.equal(clients['test/NOSUCH/hi'].disabled, true);
  });

  test('test strategy with valid but disabled client', async function() {
    addClient('test/user1/', ['assume:also:user1'], true);
    await scan(auth, strategies);
    assert.equal(clients['test/user1/'].disabled, true);
  });

});
