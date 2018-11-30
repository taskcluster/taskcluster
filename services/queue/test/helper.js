const assert = require('assert');
const assume = require('assume');
const path = require('path');
const _ = require('lodash');
const taskcluster = require('taskcluster-client');
const libUrls = require('taskcluster-lib-urls');
const mocha = require('mocha');
const builder = require('../src/api');
const exchanges = require('../src/exchanges');
const load = require('../src/main');
const data = require('../src/data');
const temporary = require('temporary');
const mockAwsS3 = require('mock-aws-s3');
const nock = require('nock');
const FakeBlobStore = require('./fake_blob_store');
const {fakeauth, stickyLoader, Secrets} = require('taskcluster-lib-testing');
const zurvan = require('zurvan');
const timers = require('timers');
const {FakeClient} = require('taskcluster-lib-pulse');
const slugid = require('slugid');

const helper = module.exports;

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
  secretName: 'project/taskcluster/testing/taskcluster-queue',
  secrets: {
    taskcluster: [
      {env: 'TASKCLUSTER_ROOT_URL', cfg: 'taskcluster.rootUrl', name: 'rootUrl',
        mock: libUrls.testRootUrl()},
      {env: 'TASKCLUSTER_CLIENT_ID', cfg: 'taskcluster.credentials.clientId', name: 'clientId'},
      {env: 'TASKCLUSTER_ACCESS_TOKEN', cfg: 'taskcluster.credentials.accessToken', name: 'accessToken'},
    ],
    aws: [
      {env: 'AWS_ACCESS_KEY_ID', cfg: 'aws.accessKeyId', name: 'accessKeyId'},
      {env: 'AWS_SECRET_ACCESS_KEY', cfg: 'aws.secretAccessKey', name: 'secretAccessKey'},
      {env: 'PUBLIC_ARTIFACT_BUCKET', cfg: 'app.publicArtifactBucket', name: 'publicArtifactBucket',
        mock: 'fake-public'},
      {env: 'PRIVATE_ARTIFACT_BUCKET', cfg: 'app.privateArtifactBucket', name: 'privateArtifactBucket',
        mock: 'fake-private'},
      {env: 'ARTIFACT_REGION', cfg: 'aws.region', name: 'artifactRegion',
        mock: 'us-central-7'},
      {env: 'PUBLIC_BLOB_ARTIFACT_BUCKET', cfg: 'app.publicBlobArtifactBucket', name: 'publicBlobArtifactBucket',
        mock: 'fake-public-blob'},
      {env: 'PRIVATE_BLOB_ARTIFACT_BUCKET', cfg: 'app.privateBlobArtifactBucket', name: 'privateBlobArtifactBucket',
        mock: 'fake-private-blob'},
      {env: 'BLOB_ARTIFACT_REGION', cfg: 'app.blobArtifactRegion', name: 'blobArtifactRegion',
        mock: 'us-central-7'},
    ],
    azure: [
      {env: 'AZURE_ACCOUNT_ID', cfg: 'azure.accountId', name: 'accountId'},
      {env: 'AZURE_ACCOUNT_KEY', cfg: 'azure.accountKey', name: 'accountKey'},
    ],
  },
  load: exports.load,
});

helper.rootUrl = 'http://localhost:60401';

/**
 * helper.runWithFakeTime(<fn>, <time>), will run async function <fn> for <time>
 * fake milliseconds.  It is intended to wrap the function argument to Mocha's `test`.
 *
 * Fake time is only used when mock is true; in a real situation, we are interacting with
 * real services and must use the same clock they do.
 */
helper.runWithFakeTime = (fn, mock, time=30000) => {
  if (!mock) {
    // if not mocking, we can't use fake time as it will cause all sorts
    // of timeouts to occur immediately
    return fn;
  }
  return async function wrap() {
    await zurvan.interceptTimers({
      systemTime: new Date(),
      denyImplicitTimer: true,
      throwOnInvalidClearTimer: false, // superagent does this..
      rejectOnCallbackFailure: true,
      fakeNodeDedicatedTimers: false, // so we can call a real timers.setImmediate
    });
    fakingTime = true;

    let finished, err;
    this.slow(time);
    fn.apply(this, []).then(
      () => {
        finished = true;
      },
      e => {
        finished = true;
        err = e;
      });

    // intermingle setImmediate calls with advanceTime calls, so that things zurvan cannot
    // successfully fake (like JS files internal to Node) get a chance to run.
    while (time > 0 && !finished) {
      await zurvan.advanceTime(100);
      time -= 100;
      await new Promise(resolve => timers.setImmediate(resolve));
    }

    fakingTime = false;
    await zurvan.releaseTimers();
    if (err) {
      throw err;
    }
    if (!finished) {
      throw new Error(`test case not finished after faked passage of ${time}ms`);
    }
  };
};

/**
 * Set up to use mock-aws-s3 for S3 operations when mocking.
 */
exports.withS3 = (mock, skipping) => {
  let tmpDir;

  suiteSetup('setup withS3', async function() {
    if (skipping()) {
      return;
    }

    if (mock) {
      tmpDir = new temporary.Dir();
      mockAwsS3.config.basePath = tmpDir.path;

      const cfg = await exports.load('cfg');
      exports.load.cfg('aws.accessKeyId', undefined);
      exports.load.cfg('aws.secretAccessKey', undefined);

      const mock = new mockAwsS3.S3({});
      // emulate AWS's "promise" mode
      const makeAwsFunc = fn => (...args) => ({
        promise: () => fn.apply(mock, args),
      });

      // mockAwsS3 does not cover CORS methods
      let CORSRules = [];
      mock.getBucketCors = makeAwsFunc(async () => ({
        CORSRules,
      }));
      mock.putBucketCors = makeAwsFunc(async ({CORSConfiguration}) => {
        CORSRules = _.cloneDeep(CORSConfiguration.CORSRules);
      });

      exports.load.cfg('aws.mock', mock);
    }
  });

  suiteTeardown('cleanup withS3', function() {
    if (tmpDir) {
      tmpDir.rmdirSync();
    }
  });
};

/**
 * Provide a fake QueueService implementation at helper.queueService
 */
exports.withQueueService = (mock, skipping) => {
  suiteSetup(async function() {
    if (skipping()) {
      return;
    }

    if (mock) {
      helper.load.cfg('azure.fake', true);
      helper.queueService = await helper.load('queueService');
    }
  });

  suiteSetup(async function() {
    if (skipping()) {
      return;
    }

    if (mock) {
      helper.queueService.client._reset();
    }
  });
};

/**
 * Inject a fake BlobStore class, at helper.blobStore.
 */
exports.withBlobStore = (mock, skipping) => {
  suiteSetup(async function() {
    if (skipping()) {
      return;
    }

    if (mock) {
      helper.blobStore = new FakeBlobStore();
      helper.load.inject('blobStore', helper.blobStore);
    }
  });

  suiteSetup(async function() {
    if (skipping()) {
      return;
    }

    if (mock) {
      helper.blobStore._reset();
    }
  });
};

/**
 * Mock the https://ip-ranges.amazonaws.com/ip-ranges.json endpoint
 * to use a fixed set of IP ranges for testing.
 *
 * Note that this file is *always* mocked, regardless of any secrets.
 */
exports.withAmazonIPRanges = (mock, skipping) => {
  let interceptor;

  suiteSetup(async function() {
    if (skipping()) {
      return;
    }

    interceptor = nock('https://ip-ranges.amazonaws.com')
      .persist()
      .get('/ip-ranges.json')
      .replyWithFile(200, __dirname + '/ip-ranges.json', {'Content-Type': 'application/json'});
  });

  suiteTeardown(async function() {
    if (interceptor) {
      nock.removeInterceptor(interceptor);
      interceptor = undefined;
    }
  });
};

/**
 * Set helper.<Class> for each of the Azure entities used in the service
 */
exports.withEntities = (mock, skipping) => {
  const tables = [
    {
      name: 'Artifact',
      context: async () => ({
        blobStore: await helper.load('blobStore'),
        publicBucket: await helper.load('publicArtifactBucket'),
        privateBucket: await helper.load('privateArtifactBucket'),
        monitor: await helper.load('monitor'),
        s3Controller: await helper.load('s3Controller'),
      }),
    },
    {name: 'Task'},
    {name: 'TaskGroup'},
    {name: 'TaskGroupMember'},
    {name: 'TaskGroupActiveSet', className: 'TaskGroupMember'},
    {name: 'TaskRequirement'},
    {name: 'TaskDependency'},
    {name: 'Provisioner'},
    {name: 'WorkerType'},
    {name: 'Worker'},
  ];

  suiteSetup(async function() {
    if (skipping()) {
      return;
    }

    if (mock) {
      helper.load.inject('publicArtifactBucket', {});
      const cfg = await exports.load('cfg');
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
      const cfg = await helper.load('cfg');
      Object.keys(cfg.app).forEach(prop => {
        if (prop.endsWith('TableName')) {
          helper.load.cfg(`app.${prop}`, cfg.app[prop] + TABLE_SUFFIX);
        }
      });
    }

    await Promise.all(tables.map(async tbl => {
      const table = await exports.load(tbl.name);
      exports[tbl.name] = table;
      await table.ensureTable();
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
  setup(cleanup);
  suiteTeardown(cleanup);
};

/**
 * Set up an API server.  Call this after withEntities, so the server
 * uses the same Entities classes.
 *
 * This also sets up helper.scopes to set the scopes for helper.queue, the
 * API client object, and stores a client class a helper.Queue.
 */
exports.withServer = (mock, skipping) => {
  let webServer;

  suiteSetup(async function() {
    if (skipping()) {
      return;
    }
    const cfg = await exports.load('cfg');

    // even if we are using a "real" rootUrl for access to Azure, we use
    // a local rootUrl to test the API, including mocking auth on that
    // rootUrl.
    exports.load.cfg('taskcluster.rootUrl', helper.rootUrl);
    fakeauth.start({'test-client': ['*']}, {rootUrl: helper.rootUrl});

    // the workClaimer needs to use `test-client` too, so feed it the right
    // input..
    exports.load.cfg('taskcluster.credentials',
      {clientId: 'test-client', accessToken: 'ignored'});
    await exports.load('workClaimer');

    helper.Queue = taskcluster.createClient(builder.reference());

    helper.scopes = (...scopes) => {
      const options = {
        // Ensure that we use global agent, to avoid problems with keepAlive
        // preventing tests from exiting
        agent:            require('http').globalAgent,
        rootUrl: helper.rootUrl,
      };
      // if called as scopes('none'), don't pass credentials at all
      if (scopes && scopes[0] !== 'none') {
        options['credentials'] = {
          clientId:       'test-client',
          accessToken:    'none',
        };
        options['authorizedScopes'] = scopes.length > 0 ? scopes : undefined;
      }
      helper.queue = new helper.Queue(options);
    };

    webServer = await helper.load('server');
  });

  setup(async function() {
    if (skipping()) {
      return;
    }
    // reset scopes to *
    helper.scopes();
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

    await helper.load('cfg');
    helper.load.inject('pulseClient', new FakeClient());
    helper.publisher = await helper.load('publisher');

    helper.checkNextMessage = (exchange, check) => {
      for (let i = 0; i < helper.messages.length; i++) {
        const message = helper.messages[i];
        // skip messages for other exchanges; this allows us to ignore
        // ordering of messages that occur in indeterminate order
        if (!message.exchange.endsWith(exchange)) {
          continue;
        }
        check && check(message);
        helper.messages.splice(i, 1); // delete message from queue
        return;
      }
      throw new Error(`No messages found on exchange ${exchange}; ` +
        `message exchanges: ${JSON.stringify(helper.messages.map(m => m.exchange))}`);
    };

    helper.checkNoNextMessage = exchange => {
      assert(!helper.messages.some(m => m.exchange.endsWith(exchange)));
    };
  });

  const fakePublish = msg => { helper.messages.push(msg); };
  setup(function() {
    helper.messages = [];
    helper.publisher.on('message', fakePublish);
  });

  teardown(function() {
    helper.publisher.removeListener('message', fakePublish);
  });
};

/**
 * Set up a polling service (dependency-resolver, etc.)
 *
 * helper.startPollingService will start the service.  Note that the
 * caller must stop the service *before* returning.
 */
exports.withPollingServices = (mock, skipping) => {
  suiteSetup(async function() {
    if (skipping()) {
      return;
    }
    
    helper.startPollingService = async service => {
      const svc = await helper.load(service);
      // remove it right away, as it is started on load
      helper.load.remove(service);
      return svc;
    };
  });

  suiteTeardown(async function() {
    helper.startPollingService = null;
  });
};

/**
 * Run various expiration loader components
 */

helper.runExpiration = async component => {
  helper.load.save();
  try {
    return await helper.load(component);
  } finally {
    helper.load.restore();
  }
};
