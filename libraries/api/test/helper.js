const testing = require('taskcluster-lib-testing');
const SchemaSet = require('taskcluster-lib-validate');
const MonitorBuilder = require('taskcluster-lib-monitor');
const assert = require('assert');
const path = require('path');
const express = require('express');

let runningServer = null;

const rootUrl = 'http://localhost:23525';
exports.rootUrl = rootUrl;

/**
 * Set up a testing server on port 23525 serving the given API.  If monitor is
 * specified, it is added to the router.
 */
exports.setupServer = async ({builder, monitor, context}) => {
  testing.fakeauth.start([], {rootUrl});
  assert(runningServer === null);

  const schemaset = new SchemaSet({
    serviceName: 'test',
    folder: path.join(__dirname, 'schemas'),
  });

  if (!monitor) {
    monitor = exports.monitor();
  }

  const api = await builder.build({
    rootUrl,
    schemaset,
    monitor,
    context,
  });

  // Create application
  const app = express();
  api.express(app);

  return await new Promise(function(accept, reject) {
    const server = app.listen(23525);
    server.once('listening', function() {
      runningServer = server;
      accept(server);
    });
    server.once('error', reject);
  });
};

exports.monitor = () => {
  const monitorBuilder = new MonitorBuilder({
    projectName: 'foo',
  });
  monitorBuilder.setup({
    enable: false,
  });
  return monitorBuilder.monitor();
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
