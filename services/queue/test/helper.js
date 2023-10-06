const _ = require('lodash');
const assert = require('assert');
const slugid = require('slugid');
const taskcluster = require('taskcluster-client');
const builder = require('../src/api');
const load = require('../src/main');
const { tmpdir } = require('os');
const { mkdtempSync, rmSync } = require('fs');
const { sep } = require('path');
const mockAwsS3 = require('mock-aws-s3');
const nock = require('nock');
const { fakeauth, stickyLoader, Secrets, withPulse, withMonitor, withDb, resetTables } = require('taskcluster-lib-testing');

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
      { env: 'AWS_ACCESS_KEY_ID', cfg: 'aws.accessKeyId', name: 'accessKeyId' },
      { env: 'AWS_SECRET_ACCESS_KEY', cfg: 'aws.secretAccessKey', name: 'secretAccessKey' },
      { env: 'PUBLIC_ARTIFACT_BUCKET', cfg: 'app.publicArtifactBucket', name: 'publicArtifactBucket',
        mock: 'fake-public' },
      { env: 'PRIVATE_ARTIFACT_BUCKET', cfg: 'app.privateArtifactBucket', name: 'privateArtifactBucket',
        mock: 'fake-private' },
      { env: 'ARTIFACT_REGION', cfg: 'aws.region', name: 'artifactRegion',
        mock: 'us-central-7' },
    ],
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
      tmpDir = mkdtempSync(`${tmpdir()}${sep}`);
      mockAwsS3.config.basePath = tmpDir;

      await exports.load('cfg');
      exports.load.cfg('aws.accessKeyId', undefined);
      exports.load.cfg('aws.secretAccessKey', undefined);

      const mock = new mockAwsS3.S3({
        params: {
          Bucket: 'fake-public',
        },
      });
      // emulate AWS's "promise" mode
      const makeAwsFunc = fn => (...args) => ({
        promise: () => fn.apply(mock, args),
      });

      // mockAwsS3 does not cover CORS methods
      let CORSRules = [];
      mock.getBucketCors = makeAwsFunc(async () => ({
        CORSRules,
      }));
      mock.putBucketCors = makeAwsFunc(async ({ CORSConfiguration }) => {
        CORSRules = _.cloneDeep(CORSConfiguration.CORSRules);
      });

      exports.load.cfg('aws.mock', mock);
    }
  });

  suiteTeardown('cleanup withS3', function() {
    if (tmpDir) {
      rmSync(tmpDir, { recursive: true });
    }
  });
};

/**
 * Set up to use mock-aws-s3 for S3-like operations on GCS
 *
 * Discovered differencies os far:
 * - DeleteObject throws 404 (aws returns 204)
 * - DeleteObjects not supported
 */
exports.withGCS = (mock, skipping) => {
  let tmpDir;

  suiteSetup('setup withGCS', async function() {
    if (skipping()) {
      return;
    }

    if (mock) {
      tmpDir = mkdtempSync(`${tmpdir()}${sep}`);
      mockAwsS3.config.basePath = tmpDir;

      await exports.load('cfg');
      exports.load.cfg('aws.accessKeyId', undefined);
      exports.load.cfg('aws.secretAccessKey', undefined);

      const mock = new mockAwsS3.S3({
        params: {
          Bucket: 'fake-public',
        },
      });
      // emulate AWS's "promise" mode
      const makeAwsFunc = fn => (...args) => ({
        promise: () => fn.apply(mock, args),
      });

      // mockAwsS3 does not cover CORS methods
      let CORSRules = [];
      mock.getBucketCors = makeAwsFunc(async () => ({
        CORSRules,
      }));
      mock.putBucketCors = makeAwsFunc(async ({ CORSConfiguration }) => {
        CORSRules = _.cloneDeep(CORSConfiguration.CORSRules);
      });
      mock.deleteObjects = makeAwsFunc(async () => {
        throw new Error('InvalidArgument');
      });
      mock._origDeleteObject = mock.deleteObject;
      mock.deleteObject = makeAwsFunc(async (...args) => {
        // emulate GCS behaviour by throwing 404 if file is missing
        // we call getObject first that is guaranteed to throw NoSuchKey
        await mock.getObject.apply(mock, args).promise();
        // and then do the actual delete
        return await mock._origDeleteObject.apply(mock, args).promise();
      });

      exports.load.cfg('aws.mock', mock);
    }
  });

  suiteTeardown('cleanup withGCS', function() {
    if (tmpDir) {
      rmSync(tmpDir, { recursive: true });
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
      .replyWithFile(200, __dirname + '/fake-ip-ranges.json', { 'Content-Type': 'application/json' });
  });

  suiteTeardown(async function() {
    if (interceptor) {
      nock.removeInterceptor(interceptor);
      interceptor = undefined;
    }
  });
};

exports.withDb = (mock, skipping) => {
  withDb(mock, skipping, exports, 'queue');
};

/**
 * Set up a fake object service that supports uploads and downlods.
 */
exports.withObjectService = (mock, skipping) => {
  let objects = new Map();
  suiteSetup(async function() {
    const err404 = message => {
      const err = new Error(message);
      err.statusCode = 404;
      return err;
    };
    helper.objectService = new taskcluster.Object({
      rootUrl: helper.rootUrl,
      fake: {
        createUpload: async (name, { expires, hashes, projectId, proposedUploadMethods, uploadId }) => {
          if (objects.has(name)) {
            throw new Error(`Object ${name} already exists`);
          }
          objects.set(name, { uploadId, expires, projectId, hashes });
          return { expires, projectId, uploadId, uploadMethod: {} };
        },
        finishUpload: async (name, { expires, hashes, projectId, uploadId }) => {
          const object = objects.get(name);
          if (!object) {
            throw err404(`No such object ${name}`);
          }
          assert.equal(object.uploadId, uploadId);
          object.uploadId = null;
          return {};
        },
        startDownload: async (name, { acceptDownloadMethods }) => {
          if (!acceptDownloadMethods.simple) {
            throw new Error('Expected download method `simple`');
          }
          const object = objects.get(name);
          if (!object) {
            throw err404(`No such object ${name}`);
          }
          if (object.uploadId) {
            throw err404(`Object ${name} not finished`);
          }
          return { method: 'simple', url: 'https://tc-download.example.com' };
        },
        object: async (name) => {
          const object = objects.get(name);
          if (!object) {
            throw err404(`No such object ${name}`);
          }
          if (object.uploadId) {
            throw err404(`Object ${name} not finished`);
          }
          return { expires: object.expires, projectId: object.projectId, hashes: object.hashes };
        },
      },
    });
    exports.load.inject('objectService', helper.objectService);
  });

  setup(function() {
    objects = new Map();
  });
};

/**
 * Set up an API server.  Call this after withDb, so the server
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
    fakeauth.start({
      'test-client': ['*'],
    }, { rootUrl: helper.rootUrl });

    // the workClaimer needs to use `test-client` too, so feed it the right
    // input..
    exports.load.cfg('taskcluster.credentials',
      { clientId: 'test-client', accessToken: 'ignored' });
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
  withPulse({ helper, skipping, namespace: 'taskcluster-queue' });
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
 * Make a random task queue ID
 */
exports.makeTaskQueueId = prefix => `${prefix}/test-${slugid.v4().replace(/[_-]/g, '').toLowerCase()}-a`;

/**
 * Check the date formats of a task status
 */
const DATE_FORMAT = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;
exports.checkDates = ({ status }) => {
  const chk = (d, n) => {
    if (d !== undefined) {
      assert(DATE_FORMAT.test(d), `Got invalid date ${d} for ${n}`);
    }
  };

  chk(status.deadline, "status.deadline");
  chk(status.expires, "status.expires");
  for (let run of status.runs) {
    chk(run.takenUntil, "run.takenUntil");
    chk(run.scheduled, "run.scheduled");
    chk(run.started, "run.started");
    chk(run.resolved, "run.resolved");
  }
  return { status };
};

exports.resetTables = (mock, skipping) => {
  setup('reset tables', async function() {
    await resetTables({ tableNames: [
      'tasks',
      'task_groups',
      'task_dependencies',
      'queue_workers',
      'task_queues',
    ] });
  });
};
