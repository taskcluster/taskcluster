const assert = require('assert');
const debug = require('debug')('test:static-clients');
const helper = require('./helper');
const slugid = require('slugid');
const _ = require('lodash');
const assume = require('assume');
const testing = require('taskcluster-lib-testing');
const taskcluster = require('taskcluster-client');

helper.secrets.mockSuite(helper.suiteName(__filename), ['app', 'azure'], function(mock, skipping) {
  helper.withPulse(mock, skipping);
  helper.withEntities(mock, skipping);
  helper.withRoles(mock, skipping);
  helper.withServers(mock, skipping);
  helper.withCfg(mock, skipping);

  test('static/taskcluster/root exists', async () => {
    await helper.apiClient.client('static/taskcluster/root');
  });

  test('static/taskcluster/test-static-client does not exist', async () => {
    try {
      await helper.apiClient.client('static/taskcluster/test-static-client');
      assert(false, 'expected an error');
    } catch (err) {
      assume(err.code).equals('ResourceNotFound');
    }
  });

  test('static/taskcluster/test-static-client can be created and removed', async () => {
    debug('test that we can create static clients');
    await helper.Client.syncStaticClients([
      ...helper.cfg.app.staticClients, {
        clientId: 'static/taskcluster/test-static-client',
        accessToken: 'test-secret',
        description: 'Just testing, you should never see this in production!!!',
        scopes: ['dummy-scope'],
      },
    ]);

    debug('test that static client was created');
    const c = await helper.apiClient.client('static/taskcluster/test-static-client');
    assume(c.clientId).equals('static/taskcluster/test-static-client');
    assume(c.scopes).includes('dummy-scope');

    debug('test that we delete the static client again');
    await helper.Client.syncStaticClients(helper.cfg.app.staticClients);
    try {
      await helper.apiClient.client('static/taskcluster/test-static-client');
      assert(false, 'expected an error');
    } catch (err) {
      assume(err.code).equals('ResourceNotFound');
    }
  });
});
