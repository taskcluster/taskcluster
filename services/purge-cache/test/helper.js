const path = require('path');
const builder = require('../src/api');
const data = require('../src/data');
const taskcluster = require('taskcluster-client');
const load = require('../src/main');
const {stickyLoader, Secrets, fakeauth} = require('taskcluster-lib-testing');
const slugid = require('slugid');

const testclients = {
  'test-client': ['*'],
  'test-server': ['*'],
};

exports.suiteName = path.basename;
exports.rootUrl = 'http://localhost:60415';

// a suffix used to generate unique table names so that parallel test runs do not
// interfere with one another.  We remove these at the end of the test run.
const TABLE_SUFFIX = slugid.nice().replace(/[_-]/g, '');

exports.load = stickyLoader(load);

suiteSetup(async function() {
  exports.load.inject('profile', 'test');
  exports.load.inject('process', 'test');
});

// set up the testing secrets
exports.secrets = new Secrets({
  secretName: 'project/taskcluster/testing/taskcluster-purge-cache',
  secrets: {
    taskcluster: [
      {env: 'TASKCLUSTER_ROOT_URL', cfg: 'taskcluster.rootUrl', name: 'rootUrl'},
      {env: 'TASKCLUSTER_CLIENT_ID', cfg: 'taskcluster.credentials.clientId', name: 'clientId'},
      {env: 'TASKCLUSTER_ACCESS_TOKEN', cfg: 'taskcluster.credentials.accessToken', name: 'accessToken'},
    ],
  },
  load: exports.load,
});

/**
 * Set helper.<Class> for each of the Azure entities used in the service
 */
exports.withEntities = (mock, skipping, options={}) => {
  const tables = [
    {name: 'CachePurge'},
  ];

  suiteSetup(async function() {
    if (skipping()) {
      return;
    }
    exports.load.save();

    await exports.load('cfg');

    if (mock) {
      await Promise.all(tables.map(async tbl => {
        exports.load.inject(tbl.name, data[tbl.className || tbl.name].setup({
          tableName: tbl.name,
          credentials: 'inMemory',
          context: tbl.context ? await tbl.context() : undefined,
        }));
      }));
    } else {
      // suffix each ..TableName config with a short suffix so that parallel
      // test runs have a good chance of not stepping on each others' feet
      const cfg = await exports.load('cfg');
      Object.keys(cfg.app).forEach(prop => {
        if (prop.endsWith('TableName')) {
          exports.load.cfg(`app.${prop}`, cfg.app[prop] + TABLE_SUFFIX);
        }
      });
    }

    await Promise.all(tables.map(async tbl => {
      exports[tbl.name] = await exports.load(tbl.name);
      await exports[tbl.name].ensureTable();
    }));
  });

  const cleanup = async () => {
    if (skipping()) {
      return;
    }

    await Promise.all(tables.map(async tbl => {
      await exports[tbl.name].scan({}, {handler: e => e.remove()});
    }));
  };
  if (!options.orderedTests) {
    setup(cleanup);
  }
  suiteTeardown(async function() {
    if (skipping()) {
      return;
    }
    exports.load.restore();
    await cleanup();
  });
};

/**
 * Set up an API server.
 */
exports.withServer = (mock, skipping) => {
  let webServer;

  suiteSetup(async function() {
    if (skipping()) {
      return;
    }
    exports.load.save();

    await exports.load('cfg');

    // even if we are using a "real" rootUrl for access to Azure, we use
    // a local rootUrl to test the API, including mocking auth on that
    // rootUrl.
    exports.load.cfg('taskcluster.rootUrl', exports.rootUrl);
    exports.load.cfg('taskcluster.clientId', null);
    exports.load.cfg('taskcluster.accessToken', null);
    fakeauth.start(testclients, {rootUrl: exports.rootUrl});

    exports.PurgeCacheClient = taskcluster.createClient(builder.reference());

    exports.apiClient = new exports.PurgeCacheClient({
      credentials: {
        clientId: 'test-client',
        accessToken: 'doesnt-matter',
      },
      rootUrl: exports.rootUrl,
    });

    webServer = await exports.load('server');
  });

  suiteTeardown(async function() {
    if (skipping()) {
      return;
    }
    if (webServer) {
      await webServer.terminate();
      webServer = null;
    }
    fakeauth.stop();
    exports.load.restore();
  });
};
