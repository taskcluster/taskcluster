import assert from 'assert';
import debugFactory from 'debug';
const debug = debugFactory('test:static-clients');
import * as helper from './helper.js';
import assume from 'assume';
import * as testing from 'taskcluster-lib-testing';
import { syncStaticClients } from '../src/static-clients.js';

helper.secrets.mockSuite(testing.suiteName(), ['azure', 'gcp'], function(mock, skipping) {
  const dbHelper = helper.withDb(mock, skipping);
  const cfgHelper = helper.withCfg(mock, skipping);
  helper.withPulse(mock, skipping);
  const serversHelper = helper.withServers(mock, skipping);

  test('static/taskcluster/root exists', async () => {
    await serversHelper.apiClient.client('static/taskcluster/root');
  });

  test('static/taskcluster/test-static-client does not exist', async () => {
    try {
      await serversHelper.apiClient.client('static/taskcluster/test-static-client');
      assert(false, 'expected an error');
    } catch (err) {
      assume(err.code).equals('ResourceNotFound');
    }
  });

  test('other clients can be created and removed', async () => {
    debug('test that we can create static clients');
    await syncStaticClients(dbHelper.db, [
      ...cfgHelper.cfg.app.staticClients, {
        clientId: 'static/mystuff/foo',
        accessToken: 'test-secret-12345678910',
        description: 'Just testing, you should never see this in production!!!',
        scopes: ['dummy-scope:bar:foo'],
      },
    ]);

    debug('test that static client was created');
    const c = await serversHelper.apiClient.client('static/mystuff/foo');
    assume(c.clientId).equals('static/mystuff/foo');
    assume(c.scopes).includes('dummy-scope:bar:foo');

    debug('test that we delete the static client again');
    await syncStaticClients(dbHelper.db, cfgHelper.cfg.app.staticClients);
    try {
      await serversHelper.apiClient.client('static/mystuff/foo');
      assert(false, 'expected an error');
    } catch (err) {
      assume(err.code).equals('ResourceNotFound');
    }
  });

  test('adding scopes for a static/taskcluster client is an error', async () => {
    await assert.rejects(() => syncStaticClients(dbHelper.db, [
      ...cfgHelper.cfg.app.staticClients
        .filter(({ clientId }) => clientId !== 'static/taskcluster/queue'),
      {
        clientId: 'static/taskcluster/queue',
        accessToken: 'test-secret-12345678910',
        description: 'testing',
        scopes: ['new-queue-scope'],
      },
    ]), /not allowed/);
  });

  test('omitting a static/taskcluster client is an error', async () => {
    await assert.rejects(() => syncStaticClients(dbHelper.db,
      cfgHelper.cfg.app.staticClients
        .filter(({ clientId }) => clientId !== 'static/taskcluster/queue')),
    /missing clients/);
  });

  test('adding extra static/taskcluster clients is an error', async () => {
    await assert.rejects(() => syncStaticClients(dbHelper.db, [
      ...cfgHelper.cfg.app.staticClients,
      {
        clientId: 'static/taskcluster/newthing',
        accessToken: 'test-secret-12345678910',
        description: 'testing',
      },
    ]), /extra clients/);
  });
});
