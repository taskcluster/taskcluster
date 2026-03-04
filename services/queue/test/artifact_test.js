import debugFactory from 'debug';
const debug = debugFactory('test:artifacts');
import assert from 'assert';
import slugid from 'slugid';
import _ from 'lodash';
import request from 'superagent';
import taskcluster from '@taskcluster/client';
import { Netmask } from 'netmask';
import { createArtifactCallsCompatible } from '../src/artifacts.js';
import assume from 'assume';
import helper from './helper.js';
import testing from '@taskcluster/lib-testing';

helper.secrets.mockSuite(testing.suiteName(), ['aws'], function(mock, skipping) {
  if (mock) {
    // this uses signed S3 URLs, which cannot easily be mocked
    return;
  }

  // Static URL from which ip-ranges from AWS services can be fetched
  const AWS_IP_RANGES_URL = 'https://ip-ranges.amazonaws.com/ip-ranges.json';

  // Make a function to restore the state of the loader so that nested
  // suites work.
  const withCleanLoaderState = () => {
    suiteSetup(() => helper.load.save());
    suiteTeardown(() => helper.load.restore());
  };

  // Make a get request with a 303 redirect, recent superagent versions does
  // this wrong with jumping between host, so this function just does the
  // redirect step, and makes sure it's done right.
  const getWith303Redirect = async (url) => {
    let res;
    try {
      res = await request.get(url).redirects(0);
    } catch (err) {
      res = err.response;
    }
    assume(res.statusCode).equals(303);
    debug(`redirect ${url} --> ${res.headers.location}`);
    return request.get(res.headers.location);
  };

  // Get something we expect to return 404, this is just easier than having
  // try/catch blocks all over the code
  const get404 = async (url) => {
    let res;
    try {
      res = await request.get(url).redirects(0);
    } catch (err) {
      res = err.response;
    }
    assume(res.statusCode).equals(404);
    return res;
  };

  // Get something we expect to return 403
  const get403 = async (url) => {
    let res;
    try {
      res = await request.get(url).redirects(0);
    } catch (err) {
      res = err.response;
    }
    assume(res.statusCode).equals(403);
    return res;
  };

  // Use the same task definition for everything
  const taskDef = {
    taskQueueId: 'no-provisioner/test-worker',
    schedulerId: 'my-scheduler',
    taskGroupId: 'dSlITZ4yQgmvxxAi4A8fHQ',
    routes: [],
    retries: 5,
    created: taskcluster.fromNowJSON(),
    deadline: taskcluster.fromNowJSON('3 days'),
    scopes: [],
    payload: {},
    metadata: {
      name: 'Unit testing task',
      description: 'Task created during unit tests',
      owner: 'jonsafj@mozilla.com',
      source: 'https://github.com/taskcluster/taskcluster-queue',
    },
    tags: {
      purpose: 'taskcluster-testing',
    },
  };
  this.timeout(3 * 60 * 1000);

  suite('without public artifact signing', () => {
    withCleanLoaderState();
    helper.withObjectService(mock, skipping);
    helper.withDb(mock, skipping);
    helper.withAmazonIPRanges(mock, skipping);
    helper.withPulse(mock, skipping);
    helper.withS3(mock, skipping);
    helper.withServer(mock, skipping);
    helper.resetTables(mock, skipping);

    let taskId, taskCredentials;

    /**
     * Create a new task and claim it
     */
    const makeAndClaimTask = async () => {
      taskId = slugid.v4();
      debug('### Creating task');
      await helper.queue.createTask(taskId, taskDef);

      debug('### Claiming task');
      // First runId is always 0, so we should be able to claim it here
      const { credentials } = await helper.queue.claimTask(taskId, 0, {
        workerGroup: 'my-worker-group',
        workerId: 'my-worker',
      });

      taskCredentials = credentials;
    };

    /**
     * Create a new artifact on the task.  `name` is the artifact name;
     * `useClientCreds` suggests using the helper client instead of the
     * task credentials; putFn is a callable to put the data somewhere,
     * if necessary; and the rest are passed to createArtifact.
     */
    const makeArtifact = async ({ name, useClientCreds, putFn, ...artifact }) => {
      debug(`### create artifact ${name} using task's temporary creds`);
      const queue = useClientCreds ?
        helper.queue :
        new helper.Queue({ rootUrl: helper.rootUrl, credentials: taskCredentials });
      const createRes = await queue.createArtifact(taskId, 0, name, artifact);

      if (artifact.storageType === 's3' && putFn) {
        await putFn(createRes);
      }

      if (artifact.storageType === 'object') {
        await queue.finishArtifact(taskId, 0, name, {});
      }
    };

    const s3Artifact = {
      name: 'public/s3.json',
      storageType: 's3',
      expires: taskcluster.fromNowJSON('1 day'),
      contentType: 'application/json',
      // by default, upload an s3 object; this is overridden for some tests
      putFn: async createRes => {
        assume(createRes.putUrl).is.ok();
        debug(`### Uploading to putUrl ${createRes.putUrl}`);
        const putRes = await request.put(createRes.putUrl).send({ message: 'Hello World' });
        assume(putRes.ok).is.ok();
      },
    };

    const tempCredScopes = credentials => JSON.parse(credentials.certificate).scopes;

    test('Download an artifact with anonymous scopes', async () => {
      await makeAndClaimTask();
      await makeArtifact(s3Artifact);

      await testing.fakeauth.withAnonymousScopes(['queue:get-artifact:public/s3.json'], async () => {
        let url = helper.queue.buildUrl(
          helper.queue.getArtifact,
          taskId, 0, 'public/s3.json',
        );
        debug('Fetching artifact from: %s', url);
        let res = await request.get(url).ok(() => true).redirects(0);
        assume(res.status).equals(303);
        assume(res.headers.location).to.not.be.empty();
        assume(res.headers.location).does.not.contain('&X-Amz-Signature=');
        const location = res.headers.location;
        res = await request.get(location);
        assume(res.ok).is.ok();
        assume(res.body).to.be.eql({ message: 'Hello World' });

        let content = await helper.queue.artifact(taskId, 0, 'public/s3.json');
        assert.equal(content.storageType, 's3');
        assert.equal(content.url, location);
      });
    });

    test('Download an artifact with a signed URL', async () => {
      await makeAndClaimTask();
      await makeArtifact(s3Artifact);

      helper.scopes(
        'queue:get-artifact:public/s3.json',
      );

      let url = helper.queue.buildSignedUrl(
        helper.queue.getArtifact,
        taskId, 0, 'public/s3.json',
      );

      debug('Fetching artifact from signed URL %s', url);
      const res = await getWith303Redirect(url);
      assume(res.ok).is.ok();
      assume(res.body).to.be.eql({ message: 'Hello World' });
    });

    test('Download an artifact with a signed URL without scopes', async () => {
      await makeAndClaimTask();
      await makeArtifact(s3Artifact);

      helper.scopes(
        'queue:get-artifact:public/something-else.json',
      );

      let url = helper.queue.buildSignedUrl(
        helper.queue.getArtifact,
        taskId, 0, 'public/s3.json',
      );

      debug('Fetching artifact from signed URL %s', url);
      await get403(url);
    });

    test('Download the latest artifact', async () => {
      await makeAndClaimTask();
      await makeArtifact(s3Artifact);

      const url = helper.queue.buildUrl(
        helper.queue.getLatestArtifact,
        taskId, 'public/s3.json',
      );

      debug('Fetching artifact from unsigned URL with anonymous scope %s', url);
      await testing.fakeauth.withAnonymousScopes(['queue:get-artifact:public/*'], async () => {
        const res = await getWith303Redirect(url);
        assume(res.ok).is.ok();
        assume(res.body).to.be.eql({ message: 'Hello World' });
      });
    });

    test('Download the latest artifact using latestArtifact', async () => {
      await makeAndClaimTask();
      await makeArtifact(s3Artifact);

      const { url } = await helper.queue.latestArtifact(taskId, 'public/s3.json');

      await testing.fakeauth.withAnonymousScopes(['queue:get-artifact:public/*'], async () => {
        const res = await request.get(url);
        assume(res.ok).is.ok();
        assume(res.body).to.be.eql({ message: 'Hello World' });
      });
    });

    test('List artifacts', async () => {
      await makeAndClaimTask();
      await makeArtifact({ ...s3Artifact, putFn: null });

      helper.scopes(
        'queue:list-artifacts:' + taskId + ':0',
      );

      const r2 = await helper.queue.listArtifacts(taskId, 0);
      assume(r2.artifacts.length).equals(1);
    });

    test('List artifacts from latest run', async () => {
      await makeAndClaimTask();
      await makeArtifact({ ...s3Artifact, putFn: null });

      helper.scopes(
        'queue:list-artifacts:' + taskId,
      );

      const r3 = await helper.queue.listLatestArtifacts(taskId);
      assume(r3.artifacts.length).equals(1);
    });

    test('listArtifacts (missing task)', async () => {
      await assert.rejects(
        () => helper.queue.listArtifacts(slugid.v4(), 0),
        err => err.code === 'ResourceNotFound');
    });

    test('listLatestArtifacts (missing task)', async () => {
      await assert.rejects(
        () => helper.queue.listLatestArtifacts(slugid.v4()),
        err => err.code === 'ResourceNotFound');
    });

    test('listArtifacts, listLatestArtifacts (missing run)', async () => {
      debug('### Creating self-dependent task');
      let taskId = slugid.v4();
      let task = {
        ...taskDef,
        dependencies: [taskId],
      };
      await helper.queue.createTask(taskId, task);

      debug('### listArtifacts (runId: 0, is missing)');
      await assert.rejects(
        () => helper.queue.listArtifacts(slugid.v4(), 0),
        err => err.code === 'ResourceNotFound');

      debug('### listLatestArtifacts (task has no runs)');
      await assert.rejects(
        () => helper.queue.listLatestArtifacts(slugid.v4(), 0),
        err => err.code === 'ResourceNotFound');

      debug('### scheduleTask');
      await helper.queue.scheduleTask(taskId);

      debug('### listArtifacts (runId: 0, is present)');
      await helper.queue.listArtifacts(taskId, 0);

      debug('### listLatestArtifacts (works)');
      await helper.queue.listLatestArtifacts(taskId);

      debug('### listArtifacts (runId: 1, is missing)');
      await assert.rejects(
        () => helper.queue.listLatestArtifacts(slugid.v4(), 1),
        err => err.code === 'ResourceNotFound');
    });

    test('listArtifacts, listLatestArtifacts (continuationToken)', async () => {
      await makeAndClaimTask();

      debug('### Create two artifacts (don\'t upload anything to S3)');
      await makeArtifact({ ...s3Artifact, name: 'public/s3-A.json', putFn: null });
      await makeArtifact({ ...s3Artifact, name: 'public/s3-B.json', putFn: null });

      debug('### reportCompleted');
      await helper.queue.reportCompleted(taskId, 0);

      debug('### listArtifacts');
      let r1 = await helper.queue.listArtifacts(taskId, 0);
      assume(r1.artifacts.length).equals(2);
      assume(r1.artifacts[0].contentType).equals('application/json');
      assume(r1.artifacts[1].contentType).equals('application/json');

      debug('### listArtifacts, limit = 1');
      let r2 = await helper.queue.listArtifacts(taskId, 0, { limit: 1 });
      assume(r2.artifacts.length).equals(1);
      assume(r2.artifacts[0].contentType).equals('application/json');
      assert(r2.continuationToken, 'missing continuationToken');

      debug('### listArtifacts, w. continuationToken');
      let r3 = await helper.queue.listArtifacts(taskId, 0, {
        continuationToken: r2.continuationToken,
      });
      assume(r3.artifacts.length).equals(1);
      assume(r3.artifacts[0].contentType).equals('application/json');
      assert(!r3.continuationToken, 'unexpected continuationToken');
      assume(r3.artifacts[0].name).not.equals(r2.artifacts[0].name);

      debug('### listLatestArtifacts');
      let r4 = await helper.queue.listLatestArtifacts(taskId);
      assume(r4.artifacts.length).equals(2);
      assume(r4.artifacts[0].contentType).equals('application/json');
      assume(r4.artifacts[1].contentType).equals('application/json');

      debug('### listLatestArtifacts, limit = 1');
      let r5 = await helper.queue.listLatestArtifacts(taskId, { limit: 1 });
      assume(r5.artifacts.length).equals(1);
      assume(r5.artifacts[0].contentType).equals('application/json');
      assert(r5.continuationToken, 'missing continuationToken');

      debug('### listLatestArtifacts, w. continuationToken');
      let r6 = await helper.queue.listLatestArtifacts(taskId, {
        continuationToken: r5.continuationToken,
      });
      assume(r6.artifacts.length).equals(1);
      assume(r6.artifacts[0].contentType).equals('application/json');
      assert(!r6.continuationToken, 'unexpected continuationToken');
      assume(r6.artifacts[0].name).not.equals(r5.artifacts[0].name);
    });

    test('artifact', async () => {
      await makeAndClaimTask();
      await makeArtifact({ ...s3Artifact, putFn: null });

      helper.scopes('queue:get-artifact:public/s3.json');

      const res = await helper.queue.artifact(taskId, 0, s3Artifact.name);
      assume(res.storageType).equals('s3');
    });

    test('artifactInfo', async () => {
      await makeAndClaimTask();
      await makeArtifact({ ...s3Artifact, putFn: null });

      helper.scopes(
        'queue:list-artifacts:' + taskId + ':0',
      );

      const res = await helper.queue.artifactInfo(taskId, 0, s3Artifact.name);
      assume(res.storageType).equals('s3');
      assume(res.name).equals(s3Artifact.name);
      assume(res.expires).equals(s3Artifact.expires);
      assume(res.contentType).equals('application/json');
    });

    test('latestArtifact', async () => {
      await makeAndClaimTask();
      await makeArtifact({ ...s3Artifact, putFn: null });

      helper.scopes('queue:get-artifact:public/s3.json');

      const res = await helper.queue.latestArtifact(taskId, s3Artifact.name);
      assume(res.storageType).equals('s3');
    });

    test('latestArtifactInfo', async () => {
      await makeAndClaimTask();
      await makeArtifact({ ...s3Artifact, putFn: null });

      helper.scopes(
        'queue:list-artifacts:' + taskId,
      );

      const res = await helper.queue.latestArtifactInfo(taskId, s3Artifact.name);
      assume(res.storageType).equals('s3');
      assume(res.name).equals(s3Artifact.name);
      assume(res.expires).equals(s3Artifact.expires);
      assume(res.contentType).equals('application/json');
    });

    test('S3 artifact with contentLength', async () => {
      await makeAndClaimTask();
      await makeArtifact({
        ...s3Artifact,
        contentLength: 12345,
        putFn: null,
      });

      helper.scopes(
        'queue:list-artifacts:' + taskId + ':0',
      );

      const list = await helper.queue.listArtifacts(taskId, 0);
      assume(list.artifacts.length).equals(1);
      assume(list.artifacts[0].contentLength).equals(12345);

      const info = await helper.queue.artifactInfo(taskId, 0, s3Artifact.name);
      assume(info.contentLength).equals(12345);
    });

    test('S3 artifact without contentLength', async () => {
      await makeAndClaimTask();
      await makeArtifact({ ...s3Artifact, putFn: null });

      helper.scopes(
        'queue:list-artifacts:' + taskId + ':0',
      );

      const list = await helper.queue.listArtifacts(taskId, 0);
      assume(list.artifacts.length).equals(1);
      assert.equal(list.artifacts[0].contentLength, undefined);

      const info = await helper.queue.artifactInfo(taskId, 0, s3Artifact.name);
      assert.equal(info.contentLength, undefined);
    });

    test('artifact (missing task)', async () => {
      await assert.rejects(
        () => helper.queue.artifact(slugid.v4(), 0, s3Artifact.name),
        err => err.code === 'ResourceNotFound');
    });

    test('artifactInfo (missing task)', async () => {
      await assert.rejects(
        () => helper.queue.artifactInfo(slugid.v4(), 0, s3Artifact.name),
        err => err.code === 'ResourceNotFound');
    });

    test('artifact (missing run)', async () => {
      await makeAndClaimTask();
      await makeArtifact({ ...s3Artifact, putFn: null });
      await assert.rejects(
        () => helper.queue.artifact(taskId, 7, s3Artifact.name),
        err => err.code === 'ResourceNotFound');
    });

    test('artifactInfo (missing run)', async () => {
      await makeAndClaimTask();
      await makeArtifact({ ...s3Artifact, putFn: null });
      await assert.rejects(
        () => helper.queue.artifactInfo(taskId, 7, s3Artifact.name),
        err => err.code === 'ResourceNotFound');
    });

    test('artifact (missing artifact)', async () => {
      await makeAndClaimTask();
      await makeArtifact({ ...s3Artifact, putFn: null });
      await assert.rejects(
        () => helper.queue.artifact(taskId, 0, 'nosuchthing'),
        err => err.code === 'ResourceNotFound');
    });

    test('artifactInfo (missing artifact)', async () => {
      await makeAndClaimTask();
      await makeArtifact({ ...s3Artifact, putFn: null });
      await assert.rejects(
        () => helper.queue.artifactInfo(taskId, 0, 'nosuchthing'),
        err => err.code === 'ResourceNotFound');
    });

    test('latestArtifact (missing task)', async () => {
      await assert.rejects(
        () => helper.queue.latestArtifact(slugid.v4(), s3Artifact.name),
        err => err.code === 'ResourceNotFound');
    });

    test('latestArtifactInfo (missing task)', async () => {
      await assert.rejects(
        () => helper.queue.latestArtifactInfo(slugid.v4(), s3Artifact.name),
        err => err.code === 'ResourceNotFound');
    });

    test('latestArtifact (missing artifact)', async () => {
      await makeAndClaimTask();
      await makeArtifact({ ...s3Artifact, putFn: null });
      await assert.rejects(
        () => helper.queue.latestArtifact(taskId, 'nosuchthing'),
        err => err.code === 'ResourceNotFound');
    });

    test('latestArtifactInfo (missing artifact)', async () => {
      await makeAndClaimTask();
      await makeArtifact({ ...s3Artifact, putFn: null });
      await assert.rejects(
        () => helper.queue.latestArtifactInfo(taskId, 'nosuchthing'),
        err => err.code === 'ResourceNotFound');
    });

    test('Download Artifact (runId: 0) from local region', async () => {
      await makeAndClaimTask();
      await makeArtifact(s3Artifact);

      const url = helper.queue.buildUrl(
        helper.queue.getArtifact,
        taskId, 0, 'public/s3.json',
      );
      debug('Get ip-ranges from EC2');
      const { body } = await request.get(AWS_IP_RANGES_URL);
      const ipRange = body.prefixes.filter(prefix => {
        return prefix.service === 'EC2' && prefix.region === 'us-east-1';
      })[0].ip_prefix;
      const fakeIp = new Netmask(ipRange).first;

      debug('Fetching artifact from unsigned URL %s', url);
      let res;
      await testing.fakeauth.withAnonymousScopes(['queue:get-artifact:public/*'], async () => {
        try {
          res = await request
            .get(url)
            .set('x-forwarded-for', fakeIp)
            .redirects(0);
        } catch (err) {
          res = err.response;
        }
      });
      assume(res.statusCode).equals(303);
    });

    test('Listing artifacts without scopes', async function() {
      const taskId = slugid.nice();

      helper.scopes('none');
      await assert.rejects(
        () => helper.queue.listArtifacts(taskId, 0),
        err => err.code === 'InsufficientScopes');
      await assert.rejects(
        () => helper.queue.listLatestArtifacts(taskId),
        err => err.code === 'InsufficientScopes');
    });

    test('Post S3 artifact with permacreds', async () => {
      await makeAndClaimTask();
      helper.scopes(
        `queue:create-artifact:${taskId}/0`,
        'queue:worker-id:my-worker-group/my-worker',
      );
      await makeArtifact({ ...s3Artifact, useClientCreds: true });
      helper.assertNoPulseMessage('artifact-created');
    });

    test('Post S3 artifact with permacreds without necessary scopes', async () => {
      await makeAndClaimTask();
      helper.scopes('none');
      await assert.rejects(
        () => makeArtifact({ ...s3Artifact, useClientCreds: true }),
        err => err.code === 'InsufficientScopes');
    });

    test('createArtifact is idempotent', async () => {
      await makeAndClaimTask();

      const name = 'my/object';
      const payload = {
        storageType: 's3',
        expires: taskcluster.fromNowJSON('1 day'),
        contentType: 'application/json',
      };
      await helper.queue.createArtifact(taskId, 0, name, payload);
      await helper.queue.createArtifact(taskId, 0, name, payload);
      helper.assertNoPulseMessage('artifact-created');
    });

    test('Object artifact visible only after finish', async () => {
      const name = 'my/object';
      await makeAndClaimTask();
      helper.scopes(
        `queue:create-artifact:${taskId}/0`,
        `queue:get-artifact:my/object`,
        'queue:list-artifacts:*',
        'queue:worker-id:my-worker-group/my-worker',
      );

      let res = await helper.queue.createArtifact(taskId, 0, name, {
        storageType: 'object',
        expires: taskcluster.fromNowJSON('1 day'),
        contentType: 'application/json',
      });
      helper.assertNoPulseMessage('artifact-created');

      assert.equal(res.storageType, 'object');
      assert.equal(res.name, `t/${taskId}/0/my/object`);
      assert.equal(res.projectId, 'none');
      const uploadId = res.uploadId;

      assert.deepEqual(tempCredScopes(res.credentials), [`object:upload:none:${res.name}`]);

      await assert.rejects(
        () => helper.queue.artifactInfo(taskId, 0, name),
        err => err.statusCode === 404);

      await assert.rejects(
        () => helper.queue.artifact(taskId, 0, name),
        err => err.statusCode === 404);

      await assert.rejects(
        () => helper.queue.getArtifact(taskId, 0, name),
        err => err.statusCode === 404);

      // finishing the artifact before the object is finished should fail
      await assert.rejects(
        () => helper.queue.finishArtifact(taskId, 0, name, {}),
        err => err.statusCode === 400);
      helper.assertNoPulseMessage('artifact-created');

      await helper.objectService.finishUpload(res.name, { uploadId });

      // finishing the artifact with the wrong uploadId should fail
      await assert.rejects(
        () => helper.queue.finishArtifact(taskId, 0, name, { uploadId: taskcluster.slugid() }),
        err => err.statusCode === 400);
      helper.assertNoPulseMessage('artifact-created');

      await helper.queue.finishArtifact(taskId, 0, name, { uploadId });
      helper.assertPulseMessage('artifact-created');

      res = await helper.queue.artifactInfo(taskId, 0, name);
      assert.equal(res.storageType, 'object');
      assert.equal(res.name, `my/object`);

      res = await helper.queue.artifact(taskId, 0, name);
      assert.equal(res.storageType, 'object');
      assert.equal(res.name, `t/${taskId}/0/my/object`);
      assert.deepEqual(tempCredScopes(res.credentials), [`object:download:${res.name}`]);

      res = await helper.queue.getArtifact(taskId, 0, name);
      assert.equal(res.url, 'https://tc-download.example.com');
    });

    test('Expire artifact', async () => {
      await makeAndClaimTask();
      await makeArtifact(s3Artifact);

      debug('### Expire artifacts');
      // config/test.js hardcoded to expire artifact 4 days in the future
      await helper.runExpiration('expire-artifacts');

      debug('### Attempt to download Artifact (runId: 0)');
      const url = helper.queue.buildUrl(
        helper.queue.getArtifact,
        taskId, 0, 'public/s3.json',
      );

      debug('Fetching artifact from unsigned URL %s', url);
      await testing.fakeauth.withAnonymousScopes(['queue:get-artifact:public/*'], async () => {
        await get404(url);
      });

      debug('Fetching artifact from unsigned URL %s, without scopes', url);
      await get403(url);
    });

    test('Check batch expiration', async () => {
      await makeAndClaimTask();

      // create more than a "batch" of artifacts, to test pagination, but skip
      // uploading to S3 to save a bit of time..
      for (let i of _.range(150)) {
        await makeArtifact({
          ...s3Artifact,
          name: `public/${i}.txt`,
          putFn: null, // don't bother uploading to S3
        });
      }

      debug('### List artifacts');
      const r2 = await helper.queue.listArtifacts(taskId, 0);
      assume(r2.artifacts.length).equals(150);

      debug('### Expire artifacts');
      // config/test.js hardcoded to expire artifact 4 days in the future
      // so these artifacts should expire
      await helper.runExpiration('expire-artifacts');

      debug('### List artifacts');
      const r3 = await helper.queue.listArtifacts(taskId, 0);
      assume(r3.artifacts.length).equals(0);
    });

    test('finish an artifact for a task that does not exist', async function() {
      await assert.rejects(
        () => helper.queue.finishArtifact(taskId, 0, 'public/foo.json', { uploadId: taskcluster.slugid() }),
        err => err.statusCode === 404);
    });

    test('finish an artifact that does not exist', async function() {
      await makeAndClaimTask();
      await assert.rejects(
        () => helper.queue.finishArtifact(taskId, 0, 'public/foo.json', { uploadId: taskcluster.slugid() }),
        err => err.statusCode === 404);
    });

    test('Post and get error artifact', async () => {
      await makeAndClaimTask();
      await makeArtifact({
        name: 'public/error.json',
        storageType: 'error',
        expires: taskcluster.fromNowJSON('1 day'),
        reason: 'file-missing-on-worker',
        message: 'Some user-defined message',
      });

      debug('### Wait for artifact created message');
      helper.assertPulseMessage('artifact-created');

      debug('### Fetch artifact content');
      const content = await helper.queue.artifact(taskId, 0, 'public/error.json');
      assert.deepEqual(content, {
        storageType: 'error',
        reason: 'file-missing-on-worker',
        message: 'Some user-defined message',
      });

      debug('### Downloading artifact');
      const url = helper.queue.buildUrl(
        helper.queue.getArtifact,
        taskId, 0, 'public/error.json',
      );

      debug('Fetching artifact from unsigned URL %s', url);
      await testing.fakeauth.withAnonymousScopes(['queue:get-artifact:public/*'], async () => {
        let res;
        try {
          res = await request.get(url);
        } catch (err) {
          res = err.response;
        }
        assume(res.ok).to.not.be.ok();
        assume(res.status).equals(424);
        assume(res.body.message).equals('Some user-defined message');
      });

      debug('### Expire artifacts');
      // config/test.js hardcoded to expire artifact 4 days in the future
      await helper.runExpiration('expire-artifacts');

      debug('### Attempt to download artifact');
      await testing.fakeauth.withAnonymousScopes(['queue:get-artifact:public/*'], async () => {
        await get404(url);
      });
    });

    test('Post and get reference artifact', async () => {
      await makeAndClaimTask();
      await makeArtifact({
        name: 'public/redirect.json',
        storageType: 'reference',
        expires: taskcluster.fromNowJSON('1 day'),
        url: 'https://google.com',
        contentType: 'text/html',
      });
      helper.assertPulseMessage('artifact-created');

      debug('### Fetch artifact content');
      const content = await helper.queue.artifact(taskId, 0, 'public/redirect.json');
      assert.deepEqual(content, {
        storageType: 'reference',
        url: 'https://google.com',
      });

      debug('### Downloading artifact');
      const url = helper.queue.buildUrl(
        helper.queue.getArtifact,
        taskId, 0, 'public/redirect.json',
      );
      debug('Fetching artifact from unsigned URL %s', url);
      await testing.fakeauth.withAnonymousScopes(['queue:get-artifact:public/*'], async () => {
        const res = await getWith303Redirect(url);
        assume(res.ok).is.ok();
      });

      debug('### Expire artifacts');
      // config/test.js hardcoded to expire artifact 4 days in the future
      await helper.runExpiration('expire-artifacts');

      debug('### Attempt to download artifact');
      await testing.fakeauth.withAnonymousScopes(['queue:get-artifact:public/*'], async () => {
        await get404(url);
      });
    });

    test('Post and get link artifact', async () => {
      await makeAndClaimTask();
      await makeArtifact(s3Artifact);
      await makeArtifact({
        name: 'public/link.json',
        storageType: 'link',
        expires: taskcluster.fromNowJSON('1 day'),
        artifact: 'public/s3.json',
      });
      helper.assertPulseMessage('artifact-created');

      debug('### Fetch artifact content');
      const content = await helper.queue.artifact(taskId, 0, 'public/link.json');
      assert.equal(content.storageType, 's3');

      debug('### Downloading artifact');
      const url = helper.queue.buildUrl(
        helper.queue.getArtifact,
        taskId, 0, 'public/link.json',
      );

      debug('Fetching artifact from unsigned URL %s', url);
      await testing.fakeauth.withAnonymousScopes(['queue:get-artifact:public/*'], async () => {
        let res = await getWith303Redirect(url);
        assume(res.ok).is.ok();
        assume(res.body).to.be.eql({ message: 'Hello World' });
      });
    });

    test('Post and get link artifact, missing scope for link', async () => {
      await makeAndClaimTask();
      await makeArtifact(s3Artifact);
      await makeArtifact({
        name: 'public/link.json',
        storageType: 'link',
        expires: taskcluster.fromNowJSON('1 day'),
        artifact: 'public/s3.json',
      });

      debug('### Downloading artifact');
      const url = helper.queue.buildUrl(
        helper.queue.getArtifact,
        taskId, 0, 'public/link.json',
      );

      debug('Fetching artifact from unsigned URL %s', url);
      await testing.fakeauth.withAnonymousScopes(['queue:get-artifact:public/s3.json'], async () => {
        await get403(url);
      });
    });

    test('Post and get link artifact, missing scope for target', async () => {
      await makeAndClaimTask();
      await makeArtifact(s3Artifact);
      await makeArtifact({
        name: 'public/link.json',
        storageType: 'link',
        expires: taskcluster.fromNowJSON('1 day'),
        artifact: 'public/s3.json',
      });

      debug('### Downloading artifact');
      const url = helper.queue.buildUrl(
        helper.queue.getArtifact,
        taskId, 0, 'public/link.json',
      );

      debug('Fetching artifact from unsigned URL %s', url);
      await testing.fakeauth.withAnonymousScopes(['queue:get-artifact:public/link.json'], async () => {
        const res = await get403(url);
        // check that the error message includes both scopes
        assume(res.body.message).contains('queue:get-artifact:public/link.json');
        assume(res.body.message).contains('queue:get-artifact:public/s3.json');
      });
    });

    test('Post and get link artifact, chain of links', async () => {
      await makeAndClaimTask();
      await makeArtifact(s3Artifact);
      let lastName = 'public/s3.json';
      for (let i of _.range(30)) {
        const name = `public/${i}`;
        await makeArtifact({
          name,
          storageType: 'link',
          expires: taskcluster.fromNowJSON('1 day'),
          artifact: lastName,
        });
        lastName = name;
      }

      helper.scopes('queue:get-artifact:*');

      debug('### Downloading artifact');
      const url = helper.queue.buildSignedUrl(
        helper.queue.getArtifact,
        taskId, 0, lastName,
      );

      debug('Fetching artifact from unsigned URL %s', url);
      let res = await getWith303Redirect(url);
      assume(res.ok).is.ok();
      assume(res.body).to.be.eql({ message: 'Hello World' });
    });

    test('Post and list chain of link artifacts', async () => {
      const chainLength = 30;

      await makeAndClaimTask();
      await makeArtifact(s3Artifact);
      let lastName = 'public/s3.json';
      for (let i of _.range(chainLength)) {
        const name = `public/${i}`;
        await makeArtifact({
          name,
          storageType: 'link',
          expires: taskcluster.fromNowJSON('1 day'),
          artifact: lastName,
        });
        lastName = name;
      }

      debug('### List artifacts');
      const r2 = await helper.queue.listArtifacts(taskId, 0);
      assume(r2.artifacts.length).equals(chainLength + 1);
    });

    test('Post reference artifact, replace with link', async () => {
      const expires = taskcluster.fromNow('1 day');
      await makeAndClaimTask();
      await makeArtifact(s3Artifact);
      await makeArtifact({
        name: 'public/thing.json',
        storageType: 'reference',
        expires,
        url: 'https://example.com',
        contentType: 'text/html',
      });
      await makeArtifact({
        name: 'public/thing.json',
        storageType: 'link',
        expires,
        artifact: 'public/s3.json',
      });
      let res = await helper.queue.listArtifacts(taskId, 0);
      assume(res.artifacts.find(a => a.name === 'public/thing.json')).to.eql({
        storageType: 'link',
        name: 'public/thing.json',
        expires: expires.toJSON(),
        contentType: 'text/html',
      });

      helper.scopes('queue:get-artifact:*');

      const url = helper.queue.buildSignedUrl(
        helper.queue.getArtifact,
        taskId, 0, 'public/thing.json',
      );
      res = await getWith303Redirect(url);
      assume(res.ok).is.ok();
      assume(res.body).to.be.eql({ message: 'Hello World' });
    });

    test('Post reference artifact, update its URL', async () => {
      await makeAndClaimTask();
      await makeArtifact({
        name: 'public/thing.json',
        storageType: 'reference',
        expires: taskcluster.fromNowJSON('1 day'),
        url: 'https://example.com',
        contentType: 'text/html',
      });
      await makeArtifact({
        name: 'public/thing.json',
        storageType: 'reference',
        expires: taskcluster.fromNowJSON('1 day'),
        url: 'https://newurl.example.com',
        contentType: 'text/html',
      });

      await testing.fakeauth.withAnonymousScopes(['queue:get-artifact:*'], async () => {
        let url = helper.queue.buildUrl(
          helper.queue.getArtifact,
          taskId, 0, 'public/thing.json',
        );
        debug('Fetching artifact from: %s', url);
        let res = await request.get(url).ok(() => true).redirects(0);
        assume(res.status).equals(303);
        assume(res.headers.location).to.eql('https://newurl.example.com');
      });
    });

    test('Redirect artifact doesn\'t expire too soon', async () => {
      await makeAndClaimTask();
      await makeArtifact({
        name: 'public/redirect.json',
        storageType: 'reference',
        expires: taskcluster.fromNowJSON('12 days'),
        url: 'https://google.com',
        contentType: 'text/html',
      });

      debug('### Expire artifacts');
      // config/test.js hardcoded to expire artifact 4 days in the future
      // In this test, expiration is in 12 days so it should remain
      await helper.runExpiration('expire-artifacts');

      debug('### Downloading artifact');
      const url = helper.queue.buildUrl(
        helper.queue.getArtifact,
        taskId, 0, 'public/redirect.json',
      );

      debug('Fetching artifact from unsigned URL %s', url);
      await testing.fakeauth.withAnonymousScopes(['queue:get-artifact:public/*'], async () => {
        let res = await getWith303Redirect(url);
        assume(res.ok).is.ok();
      });
    });

    test('Post artifact past resolution for \'exception\'', async () => {
      await makeAndClaimTask();

      debug('### Report exception');
      await helper.queue.reportException(taskId, 0, {
        reason: 'malformed-payload',
      });

      debug('### Send post artifact request');
      await makeArtifact(s3Artifact);
      // should not fail..
    });

    test('Can\'t post artifact past resolution for \'completed\'', async () => {
      await makeAndClaimTask();

      debug('### Report completed');
      await helper.queue.reportCompleted(taskId, 0);

      debug('### Send post artifact request');
      await assert.rejects(
        () => makeArtifact(s3Artifact),
        err => err.code === 'RequestConflict');
    });

    test('Can\'t post artifact past resolution for \'failed\'', async () => {
      await makeAndClaimTask();

      debug('### Report completed');
      await helper.queue.reportFailed(taskId, 0);

      debug('### Send post artifact request');
      await assert.rejects(
        () => makeArtifact(s3Artifact),
        err => err.code === 'RequestConflict');
    });

    test('Can update expiration of artifact', async () => {
      await makeAndClaimTask();

      const sooner = taskcluster.fromNow('1 day');
      const later = taskcluster.fromNow('2 day');

      await makeArtifact({ ...s3Artifact, expires: sooner });
      await makeArtifact({ ...s3Artifact, expires: later });

      const artifacts = await helper.queue.listArtifacts(taskId, 0);

      assume(new Date(artifacts.artifacts[0].expires)).to.eql(later);
    });

    test('Can not update content type of artifact', async () => {
      await makeAndClaimTask();

      await makeArtifact(s3Artifact);
      await assert.rejects(
        () => makeArtifact({ ...s3Artifact, contentType: 'text/plain' }),
        err => err.code === 'RequestConflict');

      debug('### listArtifacts');
      const artifacts = await helper.queue.listArtifacts(taskId, 0);
      const artifact = artifacts.artifacts[0];

      // Ensure content type was not updated
      assume(artifact.contentType).equals('application/json');
    });
  });

  suite('with public artifact signing', () => {
    withCleanLoaderState();
    suiteSetup(async () => {
      await helper.load('cfg');
      helper.load.cfg('app.signPublicArtifactUrls', true);
    });
    helper.withDb(mock, skipping);
    helper.withPulse(mock, skipping);
    helper.withS3(mock, skipping);
    helper.withServer(mock, skipping);
    helper.resetTables(mock, skipping);

    test('S3 artifacts contain a Signature field in the redirect', async () => {
      const taskId = slugid.v4();
      debug('### Creating task');
      await helper.queue.createTask(taskId, taskDef);

      debug('### Claiming task');
      // First runId is always 0, so we should be able to claim it here
      await helper.queue.claimTask(taskId, 0, {
        workerGroup: 'my-worker-group',
        workerId: 'my-worker',
      });

      debug('### Send post artifact request');
      helper.scopes(
        `queue:create-artifact:${taskId}/0`,
        'queue:worker-id:my-worker-group/my-worker',
      );
      const r1 = await helper.queue.createArtifact(taskId, 0, 'public/s3.json', {
        storageType: 's3',
        expires: taskcluster.fromNowJSON('1 day'),
        contentType: 'application/json',
      });
      assume(r1.putUrl).is.ok();

      debug('### Uploading to putUrl');
      let res = await request.put(r1.putUrl).send({ message: 'Hello World' });
      assume(res.ok).is.ok();

      debug('### Download Artifact (runId: 0)');
      helper.scopes('queue:get-artifact:public/s3.json');
      let url = helper.queue.buildSignedUrl(
        helper.queue.getArtifact,
        taskId, 0, 'public/s3.json',
      );
      debug('Fetching artifact from: %s', url);
      res = await request.get(url).ok(() => true).redirects(0);
      assume(res.status).equals(303);
      assume(res.headers.location).to.not.be.empty();
      assume(res.headers.location).contains('&X-Amz-Signature=');
      res = await request.get(res.headers.location);
      assume(res.ok).is.ok();
      assume(res.body).to.be.eql({ message: 'Hello World' });
    });
  });

  suite('createArtifactCallsCompatible', function() {
    const sooner = taskcluster.fromNow('1 day');
    const later = taskcluster.fromNow('2 day');
    const base = {
      storageType: 'error',
      contentType: 'text/plain',
      expires: sooner,
      details: { x: 10 },
    };

    test('same call is compatible', function() {
      assume(createArtifactCallsCompatible(base, base)).is.ok();
    });

    test('extending expires is compatible', function() {
      assume(createArtifactCallsCompatible(
        base,
        { ...base, expires: later }))
        .is.ok();
    });

    test('reducing expires is not compatible', function() {
      assume(createArtifactCallsCompatible(
        { ...base, expires: later },
        { ...base, expires: sooner }))
        .is.not.ok();
    });

    for (const storageType of ['error', 's3', 'object', 'link']) {
      // NOTE: the list above omits 'reference', as it allows detail changes
      test(`changing details for storageType ${storageType} is not allowed`, function() {
        assume(createArtifactCallsCompatible(
          { ...base, storageType, details: { x: 10 } },
          { ...base, storageType, details: { x: 20 } }))
          .is.not.ok();
      });
    }

    test('changing details for storageType reference is allowed', function() {
      assume(createArtifactCallsCompatible(
        { ...base, storageType: 'reference', details: { x: 10 } },
        { ...base, storageType: 'reference', details: { x: 20 } }))
        .is.ok();
    });

    for (const original of ['error', 's3', 'object', 'link', 'reference']) {
      for (const update of ['error', 's3', 'object', 'link', 'reference']) {
        // filter out things that should not fail
        if (original === update || (original === 'reference' && update === 'link')) {
          continue;
        }
        test(`storageType ${original} -> ${update} is not allowed`, function() {
          assume(createArtifactCallsCompatible(
            { ...base, storageType: original },
            { ...base, storageType: update }))
            .is.not.ok();
        });
      }
    }

    test(`storageType reference -> link is allowed, and content-type is ignored in this case`, function() {
      assume(createArtifactCallsCompatible(
        { ...base, storageType: 'reference', details: { url: 'abc' }, contentType: 'old/content-type' },
        { ...base, storageType: 'link', details: { artiact: 'def' }, contentType: 'new/content-type' }))
        .is.ok();
    });
  });
});
