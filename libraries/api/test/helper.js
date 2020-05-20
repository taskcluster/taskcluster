const testing = require('taskcluster-lib-testing');
const SchemaSet = require('taskcluster-lib-validate');
const {MonitorManager} = require('taskcluster-lib-monitor');
const assert = require('assert');
const path = require('path');
const {App} = require('taskcluster-lib-app');

let runningServer = null;

const rootUrl = 'http://localhost:23525';
exports.rootUrl = rootUrl;

suiteSetup('set up monitorManager', async function() {
  exports.monitor = MonitorManager.setup({
    serviceName: 'lib-api',
    fake: true,
    debug: true,
    verify: true,
    level: 'debug',
  });
  exports.monitorManager = exports.monitor.manager;
});

teardown(function() {
  exports.monitorManager.reset();
});

/**
 * Set up a testing server on port 23525 serving the given API.
 */
exports.setupServer = async ({builder, context}) => {
  testing.fakeauth.start({
    'client-with-aa-bb-dd': ['aa', 'bb', 'dd'],
  }, {rootUrl});
  assert(runningServer === null);

  const schemaset = new SchemaSet({
    serviceName: 'test',
    folder: path.join(__dirname, 'schemas'),
  });

  const api = await builder.build({
    rootUrl,
    schemaset,
    monitor: exports.monitor,
    context,
  });

  runningServer = await App({
    port: 23525,
    env: 'development',
    forceSSL: false,
    trustProxy: false,
    apis: [api],
  });
};

exports.teardownServer = async () => {
  if (runningServer) {
    await new Promise(function(accept) {
      runningServer.once('close', function() {
        runningServer = null;
        accept();
      });
      runningServer.close();
    });
  }
  testing.fakeauth.stop();
};
