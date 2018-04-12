suite('static clients', function() {
  var Promise     = require('promise');
  var assert      = require('assert');
  var debug       = require('debug')('test:static-clients');
  var helper      = require('./helper');
  var slugid      = require('slugid');
  var _           = require('lodash');
  var assume      = require('assume');
  var testing     = require('taskcluster-lib-testing');
  var taskcluster = require('taskcluster-client');

  if (!helper.hasPulseCredentials()) {
    setup(function() {
      this.skip();
    });
  } else {
    const cleanup = async () => {
      // Delete all clients not static and roles
      await helper.Client.scan({}, {handler: c => c.clientId !== 'static/' ? null : c.remove()});
      await helper.Roles.modify((roles) => roles.splice(0));
    };
    setup(cleanup);
    teardown(cleanup);
  }

  test('static/taskcluster/root exists', async () => {
    await helper.auth.client('static/taskcluster/root');
  });

  test('static/taskcluster/test-static-client does not exist', async () => {
    try {
      await helper.auth.client('static/taskcluster/test-static-client');
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
    const c = await helper.auth.client('static/taskcluster/test-static-client');
    assume(c.clientId).equals('static/taskcluster/test-static-client');
    assume(c.scopes).includes('dummy-scope');

    debug('test that we delete the static client again');
    await helper.Client.syncStaticClients(helper.cfg.app.staticClients);
    try {
      await helper.auth.client('static/taskcluster/test-static-client');
      assert(false, 'expected an error');
    } catch (err) {
      assume(err.code).equals('ResourceNotFound');
    }
  });
});
