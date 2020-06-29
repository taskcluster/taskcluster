const _ = require('lodash');
const slugid = require('slugid');
const taskcluster = require('taskcluster-client');
const builder = require('../src/api');
const load = require('../src/main');
const data = require('../src/data');
const temporary = require('temporary');
const mockAwsS3 = require('mock-aws-s3');
const nock = require('nock');
const {fakeauth, stickyLoader, Secrets, withEntity, withPulse, withMonitor, withDb, resetTables} = require('taskcluster-lib-testing');

const helper = module.exports;

exports.load = stickyLoader(load);

suiteSetup(async function() {
  exports.load.inject('profile', 'test');
  exports.load.inject('process', 'test');
});

withMonitor(exports);

// set up the testing secrets
exports.secrets = new Secrets({
  secretName: [
    'project/taskcluster/testing/taskcluster-queue',
  ],
  secrets: {
    aws: [
      {env: 'AWS_ACCESS_KEY_ID', cfg: 'aws.accessKeyId', name: 'accessKeyId'},
      {env: 'AWS_SECRET_ACCESS_KEY', cfg: 'aws.secretAccessKey', name: 'secretAccessKey'},
      {env: 'PUBLIC_ARTIFACT_BUCKET', cfg: 'app.publicArtifactBucket', name: 'publicArtifactBucket',
        mock: 'fake-public'},
      {env: 'PRIVATE_ARTIFACT_BUCKET', cfg: 'app.privateArtifactBucket', name: 'privateArtifactBucket',
        mock: 'fake-private'},
      {env: 'ARTIFACT_REGION', cfg: 'aws.region', name: 'artifactRegion',
        mock: 'us-central-7'},
    ],
    azure: withEntity.secret,
    db: withDb.secret,
  },
  load: exports.load,
});

helper.rootUrl = 'http://localhost:60401';

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

      await exports.load('cfg');
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
      helper.queueService = await helper.load('queueService');
    } else {
      // ensure we are using unique queue names from run to run of this service
      // so that tests do not interfere with one another.  This prefix can only
      // be 6 characters long..
      const pfx = 'q' + new Date().getTime().toString().slice(-5);
      await helper.load('cfg');
      helper.load.cfg('app.claimQueue', `${pfx}-claim`);
      helper.load.cfg('app.deadlineQueue', `${pfx}-deadline`);
      helper.load.cfg('app.resolvedQueue', `${pfx}-resolved`);

      helper.queueService = await helper.load('queueService');
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
      .replyWithFile(200, __dirname + '/fake-ip-ranges.json', {'Content-Type': 'application/json'});
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
  withEntity(mock, skipping, exports, 'Artifact', data.Artifact);
  withEntity(mock, skipping, exports, 'Task', data.Task);
  withEntity(mock, skipping, exports, 'TaskGroup', data.TaskGroup);
  withEntity(mock, skipping, exports, 'TaskGroupMember', data.TaskGroupMember);
  withEntity(mock, skipping, exports, 'TaskGroupActiveSet', data.TaskGroupMember);
  withEntity(mock, skipping, exports, 'TaskRequirement', data.TaskRequirement);
  withEntity(mock, skipping, exports, 'TaskDependency', data.TaskDependency);
  withEntity(mock, skipping, exports, 'Provisioner', data.Provisioner);
  withEntity(mock, skipping, exports, 'WorkerType', data.WorkerType);
  withEntity(mock, skipping, exports, 'Worker', data.Worker);
  //helper.load.inject('publicArtifactBucket', {});
};

exports.withDb = (mock, skipping) => {
  withDb(mock, skipping, exports, 'queue');
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
    await exports.load('cfg');

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
        agent: require('http').globalAgent,
        rootUrl: helper.rootUrl,
        retries: 0,
      };
      // if called as scopes('none'), don't pass credentials at all
      if (scopes && scopes[0] !== 'none') {
        options['credentials'] = {
          clientId: 'test-client',
          accessToken: 'none',
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

exports.withPulse = (mock, skipping) => {
  withPulse({helper, skipping, namespace: 'taskcluster-queue'});
};

/**
 * Set up a polling service (dependency-resolver, etc.)
 *
 * helper.startPollingService will start the service.  Note that the
 * caller must stop the service *before* returning.
 */
exports.withPollingServices = (mock, skipping) => {
  let svc;

  suiteSetup(async function() {
    if (skipping()) {
      return;
    }

    helper.startPollingService = async service => {
      svc = await helper.load(service);
      // remove it right away, as it is started on load
      helper.load.remove(service);
      return svc;
    };
    // This needs to be done manually within the context of the test
    // because if it happens in a teardown, it happens _after_ zurvan
    // has slowed down time again and that breaks this somehow
    helper.stopPollingService = async () => {
      if (svc) {
        await svc.terminate();
        svc = null;
      }
    };
  });

  teardown(async function() {
    if (svc) {
      throw new Error('Must call stopPollingService if you have started a service');
    }
  });

  suiteTeardown(function() {
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

/**
 * Make a random workerType name
 */
exports.makeWorkerType = () => `test-${slugid.v4().replace(/[_-]/g, '').toLowerCase()}-a`;

exports.resetTables = (mock, skipping) => {
  setup('reset tables', async function() {
    if (mock) {
      exports.db['queue'].reset();
    } else {
      const sec = exports.secrets.get('db');
      await resetTables({ testDbUrl: sec.testDbUrl, tableNames: [
        'queue_tasks_entities',
        'queue_artifacts_entities',
        'queue_task_groups_entities',
        'queue_task_group_members_entities',
        'queue_task_group_active_sets_entities',
        'queue_task_requirement_entities',
        'queue_task_dependency_entities',
        'queue_worker_entities',
        'queue_worker_type_entities',
        'queue_provisioner_entities',
      ]});
    }
  });
};
