const assert = require('assert');
const path = require('path');
const _ = require('lodash');
const builder = require('../src/api');
const data = require('../src/data');
const taskcluster = require('taskcluster-client');
const mocha = require('mocha');
const exchanges = require('../src/exchanges');
const load = require('../src/main');
const config = require('typed-env-config');
const {stickyLoader, Secrets, fakeauth} = require('taskcluster-lib-testing');

const testclients = {
  'test-client': ['*'],
  'test-server': ['*'],
};

exports.suiteName = path.basename;
exports.rootUrl = 'http://localhost:60415';

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

    const cfg = await exports.load('cfg');

    if (mock) {
      await Promise.all(tables.map(async tbl => {
        exports.load.inject(tbl.name, data[tbl.className || tbl.name].setup({
          tableName: tbl.name,
          credentials: 'inMemory',
          context: tbl.context ? await tbl.context() : undefined,
        }));
      }));
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
      await exports[tbl.name].scan({}, {handler: e => {
        e.remove();
      }});
    }));
  };
  if (!options.orderedTests) {
    setup(cleanup);
  }
  suiteTeardown(async function() {
    exports.load.restore();
    await cleanup();
  });
};

/**
 * Set up PulsePublisher in fake mode, at helper.publisher. Messages are stored
 * in helper.messages.  The `helper.checkNextMessage` function allows asserting the
 * content of the next message, and `helper.checkNoNextMessage` is an assertion that
 * no such message is in the queue.
 */
exports.withPulse = (mock, skipping) => {
  suiteSetup(async function() {
    if (skipping()) {
      return;
    }
    exports.load.save();

    await exports.load('cfg');
    exports.load.cfg('taskcluster.rootUrl', exports.rootUrl);
    exports.load.cfg('pulse', {fake: true});
    exports.publisher = await exports.load('publisher');

    exports.checkNextMessage = (exchange, check) => {
      for (let i = 0; i < exports.messages.length; i++) {
        const message = exports.messages[i];
        // skip messages for other exchanges; this allows us to ignore
        // ordering of messages that occur in indeterminate order
        if (!message.exchange.endsWith(exchange)) {
          continue;
        }
        check && check(message);
        exports.messages.splice(i, 1); // delete message from queue
        return;
      }
      throw new Error(`No messages found on exchange ${exchange}; ` +
        `message exchanges: ${JSON.stringify(exports.messages.map(m => m.exchange))}`);
    };

    exports.checkNoNextMessage = exchange => {
      assert(!exports.messages.some(m => m.exchange.endsWith(exchange)));
    };
  });

  suiteTeardown(async function() {
    exports.load.restore();
  });

  const fakePublish = msg => { exports.messages.push(msg); };
  setup(function() {
    exports.messages = [];
    exports.publisher.on('fakePublish', fakePublish);
  });

  teardown(function() {
    exports.publisher.removeListener('fakePublish', fakePublish);
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

    const cfg = await exports.load('cfg');

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
        clientId:       'test-client',
        accessToken:    'doesnt-matter',
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
