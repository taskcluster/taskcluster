const debug = require('debug')('test:artifacts');
const assert = require('assert');
const slugid = require('slugid');
const _ = require('lodash');
const request = require('superagent');
const taskcluster = require('taskcluster-client');
const { Netmask } = require('netmask');
const assume = require('assume');
const helper = require('./helper');
const testing = require('taskcluster-lib-testing');

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

  // Use the same task definition for everything
  const taskDef = {
    provisionerId: 'no-provisioner',
    workerType: 'test-worker',
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
    helper.withDb(mock, skipping);
    helper.withAmazonIPRanges(mock, skipping);
    helper.withPulse(mock, skipping);
    helper.withS3(mock, skipping);
    helper.withQueueService(mock, skipping);
    helper.withServer(mock, skipping);
    helper.resetTables(mock, skipping);

    test('Post Public S3 artifact', async () => {
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
        'queue:create-artifact:public/s3.json',
        'assume:worker-id:my-worker-group/my-worker',
      );
      const r1 = await helper.queue.createArtifact(taskId, 0, 'public/s3.json', {
        storageType: 's3',
        expires: taskcluster.fromNowJSON('1 day'),
        contentType: 'application/json',
      });
      assume(r1.putUrl).is.ok();

      debug('### Uploading to putUrl');
      let res = await request.put(r1.putUrl).send({message: 'Hello World'});
      assume(res.ok).is.ok();

      debug('### Download Artifact (runId: 0)');
      let url = helper.queue.buildUrl(
        helper.queue.getArtifact,
        taskId, 0, 'public/s3.json',
      );
      debug('Fetching artifact from: %s', url);
      res = await request.get(url).ok(() => true).redirects(0);
      assume(res.status).equals(303);
      assume(res.headers.location).to.not.be.empty();
      assume(res.headers.location).does.not.contain('&Signature=');
      res = await request.get(res.headers.location);
      assume(res.ok).is.ok();
      assume(res.body).to.be.eql({message: 'Hello World'});

      debug('### Download Artifact Signed URL (runId: 0)');
      url = helper.queue.buildSignedUrl(
        helper.queue.getArtifact,
        taskId, 0, 'public/s3.json',
      );
      debug('Fetching artifact from: %s', url);
      res = await getWith303Redirect(url);
      assume(res.ok).is.ok();
      assume(res.body).to.be.eql({message: 'Hello World'});

      debug('### Download Artifact (latest)');
      url = helper.queue.buildUrl(
        helper.queue.getLatestArtifact,
        taskId, 'public/s3.json',
      );
      debug('Fetching artifact from: %s', url);
      res = await getWith303Redirect(url);
      assume(res.ok).is.ok();
      assume(res.body).to.be.eql({message: 'Hello World'});

      debug('### List artifacts');
      const r2 = await helper.queue.listArtifacts(taskId, 0);
      assume(r2.artifacts.length).equals(1);

      debug('### List artifacts from latest run');
      const r3 = await helper.queue.listLatestArtifacts(taskId);
      assume(r3.artifacts.length).equals(1);

      debug('### Download Artifact (runId: 0) using proxy');
      url = helper.queue.buildUrl(
        helper.queue.getArtifact,
        taskId, 0, 'public/s3.json',
      );
      debug('Get ip-ranges from EC2');
      const {body} = await request.get(AWS_IP_RANGES_URL);
      const ipRange = body.prefixes.filter(prefix => {
        return prefix.service === 'EC2' && prefix.region === 'us-east-1';
      })[0].ip_prefix;
      const fakeIp = new Netmask(ipRange).first;
      debug('Fetching artifact from: %s', url);
      try {
        res = await request
          .get(url)
          .set('x-forwarded-for', fakeIp)
          .redirects(0);
      } catch (err) {
        res = err.response;
      }
      assume(res.statusCode).equals(303);
      assert(res.headers.location.indexOf('proxy-for-us-east-1'),
        'Expected res.headers.location to contain proxy-for-us-east-1');

      debug('### Expire artifacts');
      // config/test.js hardcoded to expire artifact 4 days in the future
      await helper.runExpiration('expire-artifacts');

      debug('### Attempt to download Artifact (runId: 0)');
      url = helper.queue.buildUrl(
        helper.queue.getArtifact,
        taskId, 0, 'public/s3.json',
      );
      debug('Fetching artifact from: %s', url);
      await get404(url);
    });

    test('Post S3 artifact (with temp creds)', async () => {
      const taskId = slugid.v4();
      debug('### Creating task');
      let taskDef2 = _.defaults({
        scopes: ['queue:create-artifact:public/s3.json'],
      }, taskDef);
      await helper.queue.createTask(taskId, taskDef2);

      debug('### Claiming task');
      // First runId is always 0, so we should be able to claim it here
      let {credentials} = await helper.queue.claimTask(taskId, 0, {
        workerGroup: 'my-worker-group',
        workerId: 'my-worker',
      });

      debug('### Send post artifact request');
      let queue = new helper.Queue({rootUrl: helper.rootUrl, credentials});
      const r1 = await queue.createArtifact(taskId, 0, 'public/s3.json', {
        storageType: 's3',
        expires: taskcluster.fromNowJSON('1 day'),
        contentType: 'application/json',
      });
      assume(r1.putUrl).is.ok();

      debug('### Uploading to putUrl');
      let res = await request.put(r1.putUrl).send({message: 'Hello World'});
      assume(res.ok).is.ok();

      debug('### Download Artifact (runId: 0)');
      let url = helper.queue.buildUrl(
        helper.queue.getArtifact,
        taskId, 0, 'public/s3.json',
      );
      debug('Fetching artifact from: %s', url);
      res = await getWith303Redirect(url);
      assume(res.ok).is.ok();
      assume(res.body).to.be.eql({message: 'Hello World'});

      debug('### Download Artifact Signed URL (runId: 0)');
      url = helper.queue.buildSignedUrl(
        helper.queue.getArtifact,
        taskId, 0, 'public/s3.json',
      );
      debug('Fetching artifact from: %s', url);
      res = await getWith303Redirect(url);
      assume(res.ok).is.ok();
      assume(res.body).to.be.eql({message: 'Hello World'});

      debug('### Download Artifact (latest)');
      url = helper.queue.buildUrl(
        helper.queue.getLatestArtifact,
        taskId, 'public/s3.json',
      );
      debug('Fetching artifact from: %s', url);
      res = await getWith303Redirect(url);
      assume(res.ok).is.ok();
      assume(res.body).to.be.eql({message: 'Hello World'});

      debug('### List artifacts');
      const r2 = await helper.queue.listArtifacts(taskId, 0);
      assume(r2.artifacts.length).equals(1);

      debug('### List artifacts from latest run');
      const r3 = await helper.queue.listLatestArtifacts(taskId);
      assume(r3.artifacts.length).equals(1);

      debug('### Download Artifact (runId: 0) using proxy');
      url = helper.queue.buildUrl(
        helper.queue.getArtifact,
        taskId, 0, 'public/s3.json',
      );
      debug('Get ip-ranges from EC2');
      const {body} = await request.get(AWS_IP_RANGES_URL);
      const ipRange = body.prefixes.filter(prefix => {
        return prefix.service === 'EC2' && prefix.region === 'us-east-1';
      })[0].ip_prefix;
      const fakeIp = new Netmask(ipRange).first;
      debug('Fetching artifact from: %s', url);
      try {
        res = await request
          .get(url)
          .set('x-forwarded-for', fakeIp)
          .redirects(0);
      } catch (err) {
        res = err.response;
      }
      assume(res.statusCode).equals(303);
      assert(res.headers.location.indexOf('proxy-for-us-east-1'),
        'Expected res.headers.location to contain proxy-for-us-east-1');

      debug('### Expire artifacts');
      // config/test.js hardcoded to expire artifact 4 days in the future
      await helper.runExpiration('expire-artifacts');

      debug('### Attempt to download Artifact (runId: 0)');
      url = helper.queue.buildUrl(
        helper.queue.getArtifact,
        taskId, 0, 'public/s3.json',
      );
      debug('Fetching artifact from: %s', url);
      await get404(url);
    });

    test('Post S3 artifact (with bad scopes)', async () => {
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
        'queue:create-artifact:public/another-s3.json',
        'assume:worker-id:my-worker-group/my-worker',
      );
      await helper.queue.createArtifact(taskId, 0, 'public/s3.json', {
        storageType: 's3',
        expires: taskcluster.fromNowJSON('1 day'),
        contentType: 'application/json',
      }).then(() => {
        assume().fail('Expected authentication error');
      }, (err) => {
        debug('Got expected authentication error: %s', err);
      });
    });

    test('Post S3 artifact (with creds from claimTask)', async () => {
      const taskId = slugid.v4();
      debug('### Creating task');
      let taskDef2 = _.defaults({
        scopes: ['queue:create-artifact:public/another-s3.json'],
      }, taskDef);
      await helper.queue.createTask(taskId, taskDef2);

      debug('### Claiming task');
      // First runId is always 0, so we should be able to claim it here
      let {credentials} = await helper.queue.claimTask(taskId, 0, {
        workerGroup: 'my-worker-group',
        workerId: 'my-worker',
      });

      debug('### Send post artifact request');
      let queue = new helper.Queue({rootUrl: helper.rootUrl, credentials});
      await queue.createArtifact(taskId, 0, 'public/s3.json', {
        storageType: 's3',
        expires: taskcluster.fromNowJSON('1 day'),
        contentType: 'application/json',
      });
    });

    test('Check expire doesn\'t drop table', async () => {
      const taskId = slugid.v4();
      debug('### Creating task');
      await helper.queue.createTask(taskId, taskDef);

      debug('### Claiming task');
      // First runId is always 0, so we should be able to claim it here
      let {credentials} = await helper.queue.claimTask(taskId, 0, {
        workerGroup: 'my-worker-group',
        workerId: 'my-worker',
      });

      debug('### Send post artifact request');
      let queue = new helper.Queue({rootUrl: helper.rootUrl, credentials});
      const r1 = await queue.createArtifact(taskId, 0, 'public/s3.json', {
        storageType: 's3',
        expires: taskcluster.fromNowJSON('12 day'),
        contentType: 'application/json',
      });
      assume(r1.putUrl).is.ok();

      debug('### Uploading to putUrl');
      let res = await request.put(r1.putUrl).send({message: 'Hello World'});
      assume(res.ok).is.ok();

      debug('### Download Artifact (runId: 0)');
      let url = helper.queue.buildUrl(
        helper.queue.getArtifact,
        taskId, 0, 'public/s3.json',
      );
      debug('Fetching artifact from: %s', url);
      res = await getWith303Redirect(url);
      assume(res.ok).is.ok();
      assume(res.body).to.be.eql({message: 'Hello World'});

      debug('### List artifacts');
      const r2 = await helper.queue.listArtifacts(taskId, 0);
      assume(r2.artifacts.length).equals(1);

      debug('### Expire artifacts');
      // config/test.js hardcoded to expire artifact 4 days in the future
      // in this test we should see that the artifact is still present as we
      // set expiration to 12 days here
      await helper.runExpiration('expire-artifacts');

      debug('### Download Artifact (runId: 0)');
      url = helper.queue.buildUrl(
        helper.queue.getArtifact,
        taskId, 0, 'public/s3.json',
      );
      debug('Fetching artifact from: %s', url);
      res = await getWith303Redirect(url);
      assume(res.ok).is.ok();
      assume(res.body).to.be.eql({message: 'Hello World'});

      debug('### List artifacts');
      const r3 = await helper.queue.listArtifacts(taskId, 0);
      assume(r3.artifacts.length).equals(1);
    });

    test('Post error artifact', async () => {
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
        'queue:create-artifact:public/error.json',
        'assume:worker-id:my-worker-group/my-worker',
      );
      await helper.queue.createArtifact(taskId, 0, 'public/error.json', {
        storageType: 'error',
        expires: taskcluster.fromNowJSON('1 day'),
        reason: 'file-missing-on-worker',
        message: 'Some user-defined message',
      });

      debug('### Wait for artifact created message');
      helper.assertPulseMessage('artifact-created');

      debug('### Downloading artifact');
      const url = helper.queue.buildUrl(
        helper.queue.getArtifact,
        taskId, 0, 'public/error.json',
      );
      debug('Fetching artifact from: %s', url);
      let res;
      try {
        res = await request.get(url);
      } catch (err) {
        res = err.response;
      }
      assume(res.ok).to.not.be.ok();
      assume(res.status).equals(424);
      assume(res.body.message).equals('Some user-defined message');

      debug('### Expire artifacts');
      // config/test.js hardcoded to expire artifact 4 days in the future
      await helper.runExpiration('expire-artifacts');

      debug('### Attempt to download artifact');
      await get404(url);
    });

    test('Post redirect artifact', async () => {
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
        'queue:create-artifact:public/redirect.json',
        'assume:worker-id:my-worker-group/my-worker',
      );
      await helper.queue.createArtifact(taskId, 0, 'public/redirect.json', {
        storageType: 'reference',
        expires: taskcluster.fromNowJSON('1 day'),
        url: 'https://google.com',
        contentType: 'text/html',
      });

      debug('### Send post artifact request (again w. new URL)');
      const pingUrl = helper.queue.buildUrl(helper.queue.ping);
      await helper.queue.createArtifact(taskId, 0, 'public/redirect.json', {
        storageType: 'reference',
        expires: taskcluster.fromNowJSON('1 day'),
        url: pingUrl,
        contentType: 'text/html',
      });

      debug('### Downloading artifact');
      const url = helper.queue.buildUrl(
        helper.queue.getArtifact,
        taskId, 0, 'public/redirect.json',
      );
      debug('Fetching artifact from: %s', url);
      const res = await getWith303Redirect(url);
      assume(res.ok).is.ok();

      debug('### Expire artifacts');
      // config/test.js hardcoded to expire artifact 4 days in the future
      await helper.runExpiration('expire-artifacts');

      debug('### Attempt to download artifact');
      await get404(url);
    });

    test('Redirect artifact doesn\'t expire too soon', async () => {
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
      await helper.queue.createArtifact(taskId, 0, 'public/redirect.json', {
        storageType: 'reference',
        expires: taskcluster.fromNowJSON('12 day'),
        url: 'https://google.com',
        contentType: 'text/html',
      });

      debug('### Send post artifact request (again w. new URL)');
      const pingUrl = helper.queue.buildUrl(helper.queue.ping);
      await helper.queue.createArtifact(taskId, 0, 'public/redirect.json', {
        storageType: 'reference',
        expires: taskcluster.fromNowJSON('12 day'),
        url: pingUrl,
        contentType: 'text/html',
      });

      debug('### Downloading artifact');
      let url = helper.queue.buildUrl(
        helper.queue.getArtifact,
        taskId, 0, 'public/redirect.json',
      );
      debug('Fetching artifact from: %s', url);
      let res = await getWith303Redirect(url);
      assume(res.ok).is.ok();

      debug('### Expire artifacts');
      // config/test.js hardcoded to expire artifact 4 days in the future
      // In this test, we check that it doesn't expire...
      await helper.runExpiration('expire-artifacts');

      debug('### Downloading artifact');
      url = helper.queue.buildUrl(
        helper.queue.getArtifact,
        taskId, 0, 'public/redirect.json',
      );
      debug('Fetching artifact from: %s', url);
      res = await getWith303Redirect(url);
      assume(res.ok).is.ok();
    });

    test('Post artifact past resolution for \'exception\'', async () => {
      const taskId = slugid.v4();
      debug('### Creating task');
      await helper.queue.createTask(taskId, taskDef);

      debug('### Claiming task');
      // First runId is always 0, so we should be able to claim it here
      await helper.queue.claimTask(taskId, 0, {
        workerGroup: 'my-worker-group',
        workerId: 'my-worker',
      });

      debug('### Report exception');
      await helper.queue.reportException(taskId, 0, {
        reason: 'malformed-payload',
      });

      debug('### Send post artifact request');
      const r1 = await helper.queue.createArtifact(taskId, 0, 'public/s3.json', {
        storageType: 's3',
        expires: taskcluster.fromNowJSON('1 day'),
        contentType: 'application/json',
      });
      assume(r1.putUrl).is.ok();
    });

    test('Can\'t post artifact past resolution for \'completed\'', async () => {
      const taskId = slugid.v4();
      debug('### Creating task');
      await helper.queue.createTask(taskId, taskDef);

      debug('### Claiming task');
      // First runId is always 0, so we should be able to claim it here
      await helper.queue.claimTask(taskId, 0, {
        workerGroup: 'my-worker-group',
        workerId: 'my-worker',
      });

      debug('### Report completed');
      await helper.queue.reportCompleted(taskId, 0);

      debug('### Send post artifact request');
      await helper.queue.createArtifact(taskId, 0, 'public/s3.json', {
        storageType: 's3',
        expires: taskcluster.fromNowJSON('1 day'),
        contentType: 'application/json',
      }).catch(err => {
        assume(err.statusCode).equals(409);
      });
    });

    test('Can\'t post artifact past resolution for \'failed\'', async () => {
      const taskId = slugid.v4();
      debug('### Creating task');
      await helper.queue.createTask(taskId, taskDef);

      debug('### Claiming task');
      // First runId is always 0, so we should be able to claim it here
      await helper.queue.claimTask(taskId, 0, {
        workerGroup: 'my-worker-group',
        workerId: 'my-worker',
      });

      debug('### Report exception');
      await helper.queue.reportFailed(taskId, 0);

      debug('### Send post artifact request');
      await helper.queue.createArtifact(taskId, 0, 'public/s3.json', {
        storageType: 's3',
        expires: taskcluster.fromNowJSON('1 day'),
        contentType: 'application/json',
      }).catch(err => {
        assume(err.statusCode).equals(409);
      });
    });

    test('Can update expiration of artifact', async () => {
      const taskId = slugid.v4();
      debug('### Creating task');
      await helper.queue.createTask(taskId, taskDef);

      debug('### Claiming task');
      // First runId is always 0, so we should be able to claim it here
      await helper.queue.claimTask(taskId, 0, {
        workerGroup: 'my-worker-group',
        workerId: 'my-worker',
      });

      const expirationIn1Day = taskcluster.fromNowJSON('1 day');
      const expirationIn2Days = taskcluster.fromNowJSON('2 days');

      debug('### Send post artifact request');
      await helper.queue.createArtifact(taskId, 0, 'public/s3.json', {
        storageType: 's3',
        expires: expirationIn1Day,
        contentType: 'application/json',
      });

      debug('### Send second post artifact request to update expiration');
      await helper.queue.createArtifact(taskId, 0, 'public/s3.json', {
        storageType: 's3',
        expires: expirationIn2Days,
        contentType: 'application/json',
      }).catch(err => {
        debug('Got error: %s, as JSON %j', err, err);
        throw err;
      });

      const artifacts = await helper.queue.listArtifacts(taskId, 0);

      debug('### reportCompleted');
      await helper.queue.reportCompleted(taskId, 0);

      const savedExpiration = new Date(artifacts.artifacts[0].expires).getTime();
      const originalExpiration = new Date(expirationIn1Day).getTime();

      assume(savedExpiration).is.greaterThan(originalExpiration);
    });

    test('Can not update content type of artifact', async () => {
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
      await helper.queue.createArtifact(taskId, 0, 'public/s3.json', {
        storageType: 's3',
        expires: taskcluster.fromNowJSON('1 day'),
        contentType: 'application/json',
      });

      debug('### Send second post artifact request to update content type');
      await helper.queue.createArtifact(taskId, 0, 'public/s3.json', {
        storageType: 's3',
        expires: taskcluster.fromNowJSON('1 day'),
        contentType: 'text/plain',
      }).then(() => {
        assume().fail('Expected request to be unsuccessful');
      }, err => {
        debug('Got error: %s, as JSON %j', err, err);
        assume(err.message).includes('Artifact already exists');
      });

      debug('### reportCompleted');
      await helper.queue.reportCompleted(taskId, 0);

      debug('### listArtifacts');
      const artifacts = await helper.queue.listArtifacts(taskId, 0);
      const artifact = artifacts.artifacts[0];

      // Ensure content type was not updated
      assume(artifact.contentType).equals('application/json');
    });

    test('listArtifacts (missing task)', async () => {
      await helper.queue.listArtifacts(slugid.v4(), 0).then(
        () => assert(false, 'Expected error'),
        err => assume(err.code).equals('ResourceNotFound'),
      );
    });

    test('listLatestArtifacts (missing task)', async () => {
      await helper.queue.listLatestArtifacts(slugid.v4(), 0).then(
        () => assert(false, 'Expected error'),
        err => assume(err.code).equals('ResourceNotFound'),
      );
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
      await helper.queue.listArtifacts(taskId, 0).then(
        () => assert(false, 'Expected error'),
        err => assume(err.code).equals('ResourceNotFound'),
      );

      debug('### listLatestArtifacts (task has no runs)');
      await helper.queue.listLatestArtifacts(taskId).then(
        () => assert(false, 'Expected error'),
        err => assume(err.code).equals('ResourceNotFound'),
      );

      debug('### scheduleTask');
      await helper.queue.scheduleTask(taskId);

      debug('### listArtifacts (runId: 0, is present)');
      await helper.queue.listArtifacts(taskId, 0);

      debug('### listLatestArtifacts (works)');
      await helper.queue.listLatestArtifacts(taskId);

      debug('### listArtifacts (runId: 1, is missing)');
      await helper.queue.listArtifacts(taskId, 1).then(
        () => assert(false, 'Expected error'),
        err => assume(err.code).equals('ResourceNotFound'),
      );
    });

    test('listArtifacts, listLatestArtifacts (continuationToken)', async () => {
      debug('### Creating task');
      let taskId = slugid.v4();
      await helper.queue.createTask(taskId, taskDef);

      debug('### Claiming task');
      // First runId is always 0, so we should be able to claim it here
      await helper.queue.claimTask(taskId, 0, {
        workerGroup: 'my-worker-group',
        workerId: 'my-worker',
      });

      debug('### Create two artifacts (don\'t upload anything to S3)');
      await Promise.all([
        helper.queue.createArtifact(taskId, 0, 'public/s3-A.json', {
          storageType: 's3',
          expires: taskcluster.fromNowJSON('1 day'),
          contentType: 'application/json',
        }),
        helper.queue.createArtifact(taskId, 0, 'public/s3-B.json', {
          storageType: 's3',
          expires: taskcluster.fromNowJSON('1 day'),
          contentType: 'application/json',
        }),
      ]);

      debug('### reportCompleted');
      await helper.queue.reportCompleted(taskId, 0);

      debug('### listArtifacts');
      let r1 = await helper.queue.listArtifacts(taskId, 0);
      assume(r1.artifacts.length).equals(2);
      assume(r1.artifacts[0].contentType).equals('application/json');
      assume(r1.artifacts[1].contentType).equals('application/json');

      debug('### listArtifacts, limit = 1');
      let r2 = await helper.queue.listArtifacts(taskId, 0, {limit: 1});
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
      let r5 = await helper.queue.listLatestArtifacts(taskId, {limit: 1});
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
  });

  suite('with public artifact signing', () => {
    withCleanLoaderState();
    suiteSetup(async () => {
      await helper.load('cfg');
      helper.load.cfg('app.signPublicArtifactURLs', true);
    });
    helper.withDb(mock, skipping);
    helper.withPulse(mock, skipping);
    helper.withS3(mock, skipping);
    helper.withQueueService(mock, skipping);
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
        'queue:create-artifact:public/s3.json',
        'assume:worker-id:my-worker-group/my-worker',
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
      let url = helper.queue.buildUrl(
        helper.queue.getArtifact,
        taskId, 0, 'public/s3.json',
      );
      debug('Fetching artifact from: %s', url);
      res = await request.get(url).ok(() => true).redirects(0);
      assume(res.status).equals(303);
      assume(res.headers.location).to.not.be.empty();
      assume(res.headers.location).contains('&Signature=');
      res = await request.get(res.headers.location);
      assume(res.ok).is.ok();
      assume(res.body).to.be.eql({ message: 'Hello World' });
    });
  });
});
