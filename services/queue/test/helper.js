import _ from 'lodash';
import assert from 'assert';
import slugid from 'slugid';
import taskcluster from '@taskcluster/client';
import builder from '../src/api.js';
import loadMain from '../src/main.js';
import {
  S3Client,
  DeleteObjectCommand,
  DeleteObjectsCommand,
  GetBucketCorsCommand,
  ListObjectsCommand,
  PutBucketCorsCommand,
  PutObjectCommand,
  GetObjectCommand,
} from '@aws-sdk/client-s3';
import { mockClient } from 'aws-sdk-client-mock';
import nock from 'nock';
import testing from '@taskcluster/lib-testing';
import { globalAgent } from 'http';

export const load = testing.stickyLoader(loadMain);
const __dirname = new URL('.', import.meta.url).pathname;

const helper = { load };

suiteSetup(async function() {
  load.inject('profile', 'test');
  load.inject('process', 'test');
});

testing.withMonitor(helper, { withPrometheus: true });

// set up the testing secrets
export const secrets = new testing.Secrets({
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
  load,
});
helper.secrets = secrets;
helper.rootUrl = 'http://localhost:60401';

/**
 * Set up to use aws-sdk-client-mock for S3 operations when mocking.
 */
export const withS3 = (mock, skipping) => {
  suiteSetup('setup withS3', async function() {
    if (skipping()) {
      return;
    }

    if (mock) {
      await load('cfg');
      load.cfg('aws.accessKeyId', undefined);
      load.cfg('aws.secretAccessKey', undefined);

      let artifacts = [];
      let corsRules = [];
      const mock = mockClient(S3Client);

      mock
        .on(PutObjectCommand)
        .callsFake(async ({ Bucket, Key, Body }) => {
          artifacts.push({ Bucket, Key, Body });
          return {};
        })
        .on(ListObjectsCommand)
        .callsFake(async ({ Bucket, Prefix }) => {
          const Contents = artifacts.filter(a => a.Bucket === Bucket && a.Key.startsWith(Prefix));
          return { Contents };
        })
        .on(DeleteObjectCommand)
        .callsFake(async ({ Key }) => {
          artifacts = artifacts.filter(a => a.Key !== Key);
          return {};
        })
        .on(DeleteObjectsCommand)
        .callsFake(async ({ Delete }) => {
          for (let { Key } of Delete.Objects) {
            artifacts = artifacts.filter(a => a.Key !== Key);
          }
          return {};
        })
        .on(GetBucketCorsCommand)
        .resolves({ CORSRules: corsRules })
        .on(PutBucketCorsCommand)
        .callsFake(async ({ CORSConfiguration }) => {
          corsRules = _.cloneDeep(CORSConfiguration.CORSRules);
          return { CORSRules: corsRules };
        });

      load.cfg('aws.mock', mock);
    }
  });
};
helper.withS3 = withS3;

/**
 * Set up to use aws-sdk-client-mock for S3-like operations on GCS
 *
 * Discovered differencies os far:
 * - DeleteObject throws 404 (aws returns 204)
 * - DeleteObjects not supported
 */
export const withGCS = (mock, skipping) => {
  suiteSetup('setup withGCS', async function() {
    if (skipping()) {
      return;
    }

    if (mock) {
      await load('cfg');
      load.cfg('aws.accessKeyId', undefined);
      load.cfg('aws.secretAccessKey', undefined);

      let artifacts = [];
      let corsRules = [];
      const mock = mockClient(S3Client);

      mock
        .on(PutObjectCommand)
        .callsFake(async ({ Bucket, Key, Body }) => {
          artifacts.push({ Bucket, Key, Body });
          return {};
        })
        .on(ListObjectsCommand)
        .callsFake(async ({ Bucket, Prefix }) => {
          const Contents = artifacts.filter(a => a.Bucket === Bucket && a.Key.startsWith(Prefix));
          return { Contents };
        })
        .on(GetObjectCommand)
        .callsFake(async ({ Bucket, Key }) => {
          const artifact = artifacts.find(a => a.Bucket === Bucket && a.Key === Key);
          if (!artifact) {
            throw new Error('NoSuchKey');
          }
          return { Body: artifact.Body };
        })
        .on(GetBucketCorsCommand)
        .resolves({ CORSRules: corsRules })
        .on(PutBucketCorsCommand)
        .callsFake(async ({ CORSConfiguration }) => {
          corsRules = _.cloneDeep(CORSConfiguration.CORSRules);
          return { CORSRules: corsRules };
        })
        .on(DeleteObjectsCommand)
        .rejects(new Error('InvalidArgument'))
        .on(DeleteObjectCommand)
        .callsFake(async ({ Key }) => {
          const artifact = artifacts.find(a => a.Key === Key);
          if (!artifact) {
            throw new Error('NoSuchKey');
          }
          artifacts = artifacts.filter(a => a.Key !== Key);
          return {};
        });

      load.cfg('aws.mock', mock);
    }
  });
};
helper.withGCS = withGCS;

/**
 * Mock the https://ip-ranges.amazonaws.com/ip-ranges.json endpoint
 * to use a fixed set of IP ranges for testing.
 *
 * Note that this file is *always* mocked, regardless of any secrets.
 */
export const withAmazonIPRanges = (mock, skipping) => {
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
helper.withAmazonIPRanges = withAmazonIPRanges;

export const withDb = (mock, skipping) => {
  testing.withDb(mock, skipping, helper, 'queue');
};
helper.withDb = withDb;

/**
 * Set up a fake object service that supports uploads and downlods.
 */
export const withObjectService = (mock, skipping) => {
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
    load.inject('objectService', helper.objectService);
  });

  setup(function() {
    objects = new Map();
  });
};
helper.withObjectService = withObjectService;

/**
 * Set up an API server.  Call this after withDb, so the server
 * uses the same Entities classes.
 *
 * This also sets up helper.scopes to set the scopes for helper.queue, the
 * API client object, and stores a client class a helper.Queue.
 */
export const withServer = (mock, skipping) => {
  let webServer;

  suiteSetup(async function() {
    if (skipping()) {
      return;
    }
    await load('cfg');

    // even if we are using a "real" rootUrl for access to Azure, we use
    // a local rootUrl to test the API, including mocking auth on that
    // rootUrl.
    load.cfg('taskcluster.rootUrl', helper.rootUrl);
    testing.fakeauth.start({
      'test-client': ['*'],
    }, { rootUrl: helper.rootUrl });

    // the workClaimer needs to use `test-client` too, so feed it the right
    // input..
    load.cfg('taskcluster.credentials',
      { clientId: 'test-client', accessToken: 'ignored' });
    await load('workClaimer');

    helper.Queue = taskcluster.createClient(builder.reference());

    helper.scopes = (...scopes) => {
      const options = {
        // Ensure that we use global agent, to avoid problems with keepAlive
        // preventing tests from exiting
        agent: globalAgent,
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
    testing.fakeauth.stop();
  });
};
helper.withServer = withServer;

export const withPulse = (mock, skipping) => {
  testing.withPulse({ helper, skipping, namespace: 'taskcluster-queue' });
};
helper.withPulse = withPulse;

/**
 * Set up a polling service (dependency-resolver, etc.)
 *
 * helper.startPollingService will start the service.  Note that the
 * caller must stop the service *before* returning.
 */
export const withPollingServices = (mock, skipping) => {
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
helper.withPollingServices = withPollingServices;

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
export const makeTaskQueueId = prefix => `${prefix}/test-${slugid.v4().replace(/[_-]/g, '').toLowerCase()}-a`;
helper.makeTaskQueueId = makeTaskQueueId;

/**
 * Check the date formats of a task status
 */
const DATE_FORMAT = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;

export const checkDates = ({ status }) => {
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
helper.checkDates = checkDates;

export const resetTables = (mock, skipping) => {
  setup('reset tables', async function() {
    await testing.resetTables({ tableNames: [
      'tasks',
      'task_groups',
      'task_dependencies',
      'queue_pending_tasks',
      'queue_workers',
      'task_queues',
    ] });
  });
};
helper.resetTables = resetTables;

// by exporting a proxy we can keep tests using same helper and import
export default helper;
