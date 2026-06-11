import helper from './helper.js';
import assert from 'node:assert';
import scanner from '../src/login/scanner.js';
import testing from '@taskcluster/lib-testing';
import Test from '../src/login/strategies/test.js';

helper.secrets.mockSuite(testing.suiteName(), [], (mock, skipping) => {
  helper.withDb(mock, skipping);
  helper.withFakeAuth(mock, skipping);
  helper.resetTables(mock, skipping);

  let strategies;
  let clients;
  let disabled;

  const auth = {
    async listClients(query) {
      assert.equal(query.prefix, 'test/');
      return { clients };
    },
    async disableClient(clientId) {
      disabled.push(clientId);
    },
    async expandScopes({ scopes }) {
      return { scopes };
    },
  };

  setup(() => {
    strategies = { test: new Test() };
    clients = [];
    disabled = [];
  });

  test('scanner does nothing with no clients', async () => {
    await scanner(auth, strategies);
  });

  test('scanner does nothing to clients with sufficient scopes', async () => {
    clients.push({
      clientId: 'test/client-1',
      expandedScopes: ['assume:role1'],
    });
    strategies.test.fakeUserRoles('client-1', ['role1']);
    await scanner(auth, strategies);
    assert.deepEqual(disabled, []);
  });

  test('scanner does nothing to clients with explicit assume:anonymous', async () => {
    clients.push({
      clientId: 'test/client-1',
      expandedScopes: ['assume:anonymous'],
    });
    strategies.test.fakeUserRoles('client-1', ['role1']);
    await scanner(auth, strategies);
    assert.deepEqual(disabled, []);
  });

  test('scanner disables clients with more scopes than the user', async () => {
    clients.push({
      clientId: 'test/client-1',
      expandedScopes: ['assume:anonymous', 'assume:role1', 'assume:role2'],
    });
    strategies.test.fakeUserRoles('client-1', ['role1']);
    await scanner(auth, strategies);
    assert.deepEqual(disabled, ['test/client-1']);
  });
});
