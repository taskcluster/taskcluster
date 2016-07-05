suite('Artifacts', function() {
  var debug         = require('debug')('test:artifacts');
  var assert        = require('assert');
  var slugid        = require('slugid');
  var _             = require('lodash');
  var Promise       = require('promise');
  var request       = require('superagent-promise');
  var assert        = require('assert');
  var urljoin       = require('url-join');
  var BlobUploader  = require('./azure-blob-uploader-sas');
  var Bucket        = require('../lib/bucket');
  var BlobStore     = require('../lib/blobstore');
  var data          = require('../lib/data');
  var base          = require('taskcluster-base');
  var taskcluster   = require('taskcluster-client');
  var {Netmask}     = require('netmask');
  var assume        = require('assume');
  var helper        = require('./helper');

  // Static URL from which ip-ranges from AWS services can be fetched
  const AWS_IP_RANGES_URL = 'https://ip-ranges.amazonaws.com/ip-ranges.json';

  // Make a get request with a 303 redirect, recent superagent versions does
  // this wrong with jumping between host, so this function just does the
  // redirect step, and makes sure it's done right.
  var getWith303Redirect = async (url) => {
    var res;
    try {
      res = await request.get(url).redirects(0).end();
    } catch (err) {
      res = err.response;
    }
    assume(res.statusCode).equals(303);
    return request.get(res.headers.location).end();
  };

  // Get something we expect to return 404, this is just easier than having
  // try/catch blocks all over the code
  var get404 = async (url) => {
    var res;
    try {
      res = await request.get(url).redirects(0).end();
    } catch (err) {
      res = err.response;
    }
    assume(res.statusCode).equals(404);
    return res;
  };

  // Use the same task definition for everything
  var taskDef = {
    provisionerId:    'no-provisioner',
    workerType:       'test-worker',
    schedulerId:      'my-scheduler',
    taskGroupId:      'dSlITZ4yQgmvxxAi4A8fHQ',
    routes:           [],
    retries:          5,
    created:          taskcluster.fromNowJSON(),
    deadline:         taskcluster.fromNowJSON('3 days'),
    scopes:           [],
    payload:          {},
    metadata: {
      name:           'Unit testing task',
      description:    'Task created during unit tests',
      owner:          'jonsafj@mozilla.com',
      source:         'https://github.com/taskcluster/taskcluster-queue',
    },
    tags: {
      purpose:        'taskcluster-testing',
    },
  };
  this.timeout(3 * 60 * 1000);

  test('Post S3 artifact', async () => {
    var taskId = slugid.v4();
    debug('### Creating task');
    await helper.queue.createTask(taskId, taskDef);

    debug('### Claiming task');
    // First runId is always 0, so we should be able to claim it here
    await helper.queue.claimTask(taskId, 0, {
      workerGroup:    'my-worker-group',
      workerId:       'my-worker',
    });

    debug('### Send post artifact request');
    helper.scopes(
      'queue:create-artifact:public/s3.json',
      'assume:worker-id:my-worker-group/my-worker',
    );
    var r1 = await helper.queue.createArtifact(taskId, 0, 'public/s3.json', {
      storageType:  's3',
      expires:      taskcluster.fromNowJSON('1 day'),
      contentType:  'application/json',
    });
    assume(r1.putUrl).is.ok();

    debug('### Uploading to putUrl');
    var res = await request.put(r1.putUrl).send({message: 'Hello World'}).end();
    assume(res.ok).is.ok();

    debug('### Download Artifact (runId: 0)');
    var url = helper.queue.buildUrl(
      helper.queue.getArtifact,
      taskId, 0, 'public/s3.json',
    );
    debug('Fetching artifact from: %s', url);
    res = await getWith303Redirect(url);
    assume(res.ok).is.ok();
    assume(res.body).to.be.eql({message: 'Hello World'});

    debug('### Download Artifact (latest)');
    var url = helper.queue.buildUrl(
      helper.queue.getLatestArtifact,
      taskId, 'public/s3.json',
    );
    debug('Fetching artifact from: %s', url);
    res = await getWith303Redirect(url);
    assume(res.ok).is.ok();
    assume(res.body).to.be.eql({message: 'Hello World'});

    debug('### List artifacts');
    var r2 = await helper.queue.listArtifacts(taskId, 0);
    assume(r2.artifacts.length).equals(1);

    debug('### List artifacts from latest run');
    var r3 = await helper.queue.listLatestArtifacts(taskId);
    assume(r3.artifacts.length).equals(1);

    debug('### Download Artifact (runId: 0) using proxy');
    var url = helper.queue.buildUrl(
      helper.queue.getArtifact,
      taskId, 0, 'public/s3.json',
    );
    debug('Get ip-ranges from EC2');
    var {body} = await request.get(AWS_IP_RANGES_URL).end();
    var ipRange = body.prefixes.filter(prefix => {
      return prefix.service === 'EC2' && prefix.region === 'us-east-1';
    })[0].ip_prefix;
    var fakeIp = new Netmask(ipRange).first;
    debug('Fetching artifact from: %s', url);
    try {
      res = await request
                    .get(url)
                    .set('x-forwarded-for', fakeIp)
                    .redirects(0)
                    .end();
    } catch (err) {
      res = err.response;
    }
    assume(res.statusCode).equals(303);
    assert(res.headers.location.indexOf('proxy-for-us-east-1'),
           'Expected res.headers.location to contain proxy-for-us-east-1');

    debug('### Expire artifacts');
    // config/test.js hardcoded to expire artifact 4 days in the future
    await helper.expireArtifacts();

    debug('### Attempt to download Artifact (runId: 0)');
    var url = helper.queue.buildUrl(
      helper.queue.getArtifact,
      taskId, 0, 'public/s3.json',
    );
    debug('Fetching artifact from: %s', url);
    await get404(url);
  });

  test('Post S3 artifact (with temp creds)', async () => {
    var taskId = slugid.v4();
    debug('### Creating task');
    let taskDef2 = _.defaults({
      scopes: ['queue:create-artifact:public/s3.json'],
    }, taskDef);
    await helper.queue.createTask(taskId, taskDef2);

    debug('### Claiming task');
    // First runId is always 0, so we should be able to claim it here
    let {credentials} = await helper.queue.claimTask(taskId, 0, {
      workerGroup:    'my-worker-group',
      workerId:       'my-worker',
    });

    debug('### Send post artifact request');
    let queue = new helper.Queue({credentials});
    var r1 = await queue.createArtifact(taskId, 0, 'public/s3.json', {
      storageType:  's3',
      expires:      taskcluster.fromNowJSON('1 day'),
      contentType:  'application/json',
    });
    assume(r1.putUrl).is.ok();

    debug('### Uploading to putUrl');
    var res = await request.put(r1.putUrl).send({message: 'Hello World'}).end();
    assume(res.ok).is.ok();

    debug('### Download Artifact (runId: 0)');
    var url = helper.queue.buildUrl(
      helper.queue.getArtifact,
      taskId, 0, 'public/s3.json',
    );
    debug('Fetching artifact from: %s', url);
    res = await getWith303Redirect(url);
    assume(res.ok).is.ok();
    assume(res.body).to.be.eql({message: 'Hello World'});

    debug('### Download Artifact (latest)');
    var url = helper.queue.buildUrl(
      helper.queue.getLatestArtifact,
      taskId, 'public/s3.json',
    );
    debug('Fetching artifact from: %s', url);
    res = await getWith303Redirect(url);
    assume(res.ok).is.ok();
    assume(res.body).to.be.eql({message: 'Hello World'});

    debug('### List artifacts');
    var r2 = await helper.queue.listArtifacts(taskId, 0);
    assume(r2.artifacts.length).equals(1);

    debug('### List artifacts from latest run');
    var r3 = await helper.queue.listLatestArtifacts(taskId);
    assume(r3.artifacts.length).equals(1);

    debug('### Download Artifact (runId: 0) using proxy');
    var url = helper.queue.buildUrl(
      helper.queue.getArtifact,
      taskId, 0, 'public/s3.json',
    );
    debug('Get ip-ranges from EC2');
    var {body} = await request.get(AWS_IP_RANGES_URL).end();
    var ipRange = body.prefixes.filter(prefix => {
      return prefix.service === 'EC2' && prefix.region === 'us-east-1';
    })[0].ip_prefix;
    var fakeIp = new Netmask(ipRange).first;
    debug('Fetching artifact from: %s', url);
    try {
      res = await request
                    .get(url)
                    .set('x-forwarded-for', fakeIp)
                    .redirects(0)
                    .end();
    } catch (err) {
      res = err.response;
    }
    assume(res.statusCode).equals(303);
    assert(res.headers.location.indexOf('proxy-for-us-east-1'),
           'Expected res.headers.location to contain proxy-for-us-east-1');

    debug('### Expire artifacts');
    // config/test.js hardcoded to expire artifact 4 days in the future
    await helper.expireArtifacts();

    debug('### Attempt to download Artifact (runId: 0)');
    var url = helper.queue.buildUrl(
      helper.queue.getArtifact,
      taskId, 0, 'public/s3.json',
    );
    debug('Fetching artifact from: %s', url);
    await get404(url);
  });

  test('Post S3 artifact (with bad scopes)', async () => {
    var taskId = slugid.v4();
    debug('### Creating task');
    await helper.queue.createTask(taskId, taskDef);

    debug('### Claiming task');
    // First runId is always 0, so we should be able to claim it here
    await helper.queue.claimTask(taskId, 0, {
      workerGroup:    'my-worker-group',
      workerId:       'my-worker',
    });

    debug('### Send post artifact request');
    helper.scopes(
      'queue:create-artifact:public/another-s3.json',
      'assume:worker-id:my-worker-group/my-worker',
    );
    await helper.queue.createArtifact(taskId, 0, 'public/s3.json', {
      storageType:  's3',
      expires:      taskcluster.fromNowJSON('1 day'),
      contentType:  'application/json',
    }).then(() => {
      assume().fail('Expected authentication error');
    }, (err) => {
      debug('Got expected authentication error: %s', err);
    });
  });

  test('Post S3 artifact (with creds from claimTask)', async () => {
    var taskId = slugid.v4();
    debug('### Creating task');
    let taskDef2 = _.defaults({
      scopes: ['queue:create-artifact:public/another-s3.json'],
    }, taskDef);
    await helper.queue.createTask(taskId, taskDef2);

    debug('### Claiming task');
    // First runId is always 0, so we should be able to claim it here
    let {credentials} = await helper.queue.claimTask(taskId, 0, {
      workerGroup:    'my-worker-group',
      workerId:       'my-worker',
    });

    debug('### Send post artifact request');
    let queue = new helper.Queue({credentials});
    await queue.createArtifact(taskId, 0, 'public/s3.json', {
      storageType:  's3',
      expires:      taskcluster.fromNowJSON('1 day'),
      contentType:  'application/json',
    });
  });

  test('Check expire doesn\'t drop table', async () => {
    var taskId = slugid.v4();
    debug('### Creating task');
    await helper.queue.createTask(taskId, taskDef);

    debug('### Claiming task');
    // First runId is always 0, so we should be able to claim it here
    let {credentials} = await helper.queue.claimTask(taskId, 0, {
      workerGroup:    'my-worker-group',
      workerId:       'my-worker',
    });

    debug('### Send post artifact request');
    let queue = new helper.Queue({credentials});
    var r1 = await queue.createArtifact(taskId, 0, 'public/s3.json', {
      storageType:  's3',
      expires:      taskcluster.fromNowJSON('12 day'),
      contentType:  'application/json',
    });
    assume(r1.putUrl).is.ok();

    debug('### Uploading to putUrl');
    var res = await request.put(r1.putUrl).send({message: 'Hello World'}).end();
    assume(res.ok).is.ok();

    debug('### Download Artifact (runId: 0)');
    var url = helper.queue.buildUrl(
      helper.queue.getArtifact,
      taskId, 0, 'public/s3.json',
    );
    debug('Fetching artifact from: %s', url);
    res = await getWith303Redirect(url);
    assume(res.ok).is.ok();
    assume(res.body).to.be.eql({message: 'Hello World'});

    debug('### List artifacts');
    var r2 = await helper.queue.listArtifacts(taskId, 0);
    assume(r2.artifacts.length).equals(1);

    debug('### Expire artifacts');
    // config/test.js hardcoded to expire artifact 4 days in the future
    // in this test we should see that the artifact is still present as we
    // set expiration to 12 days here
    await helper.expireArtifacts();

    debug('### Download Artifact (runId: 0)');
    var url = helper.queue.buildUrl(
      helper.queue.getArtifact,
      taskId, 0, 'public/s3.json',
    );
    debug('Fetching artifact from: %s', url);
    res = await getWith303Redirect(url);
    assume(res.ok).is.ok();
    assume(res.body).to.be.eql({message: 'Hello World'});

    debug('### List artifacts');
    var r2 = await helper.queue.listArtifacts(taskId, 0);
    assume(r2.artifacts.length).equals(1);
  });

  test('Post Azure artifact', async () => {
    var taskId = slugid.v4();

    debug('### Creating task');
    await helper.queue.createTask(taskId, taskDef);

    debug('### Claiming task');
    // First runId is always 0, so we should be able to claim it here
    await helper.queue.claimTask(taskId, 0, {
      workerGroup:    'my-worker-group',
      workerId:       'my-worker',
    });

    debug('### Send post artifact request');
    helper.scopes(
      'queue:create-artifact:public/azure.json',
      'assume:worker-id:my-worker-group/my-worker'
    );
    var r1 = await helper.queue.createArtifact(taskId, 0, 'public/azure.json', {
      storageType:  'azure',
      expires:      taskcluster.fromNowJSON('1 day'),
      contentType:  'application/json',
    });

    debug('### Uploading blocks');
    var block1 = slugid.v4();
    var block2 = slugid.v4();
    var uploader = new BlobUploader(r1.putUrl);
    await Promise.all([
      uploader.putBlock(block1, '{"block1_says": "Hello world",\n'),
      uploader.putBlock(block2, '"block2_says": "Hello Again"}\n'),
    ]);

    debug('### Committing blocks');
    await uploader.putBlockList([block1, block2], 'application/json');

    debug('### Downloading artifact');
    var url = helper.queue.buildUrl(
      helper.queue.getArtifact,
      taskId, 0, 'public/azure.json',
    );
    debug('Fetching artifact from: %s', url);
    var res = await getWith303Redirect(url);
    assume(res.ok).is.ok();
    assume(res.body).deep.equals({
      block1_says: 'Hello world',
      block2_says: 'Hello Again',
    });

    debug('### Expire artifacts');
    // config/test.js hardcoded to expire artifact 4 days in the future
    await helper.expireArtifacts();

    debug('### Attempt to download artifact');
    await get404(url);
  });

  test('Post error artifact', async () => {
    var taskId = slugid.v4();
    var artifactCreated;

    debug('### Creating task');
    await helper.queue.createTask(taskId, taskDef);

    debug('### Claiming task');
    // First runId is always 0, so we should be able to claim it here
    await helper.queue.claimTask(taskId, 0, {
      workerGroup:    'my-worker-group',
      workerId:       'my-worker',
    });

    debug('### Start listenFor for artifact created message');
    await helper.events.listenFor(
      'artifact-created',
      helper.queueEvents.artifactCreated({taskId}),
    );

    debug('### Send post artifact request');
    helper.scopes(
      'queue:create-artifact:public/error.json',
      'assume:worker-id:my-worker-group/my-worker',
    );
    await helper.queue.createArtifact(taskId, 0, 'public/error.json', {
      storageType:  'error',
      expires:      taskcluster.fromNowJSON('1 day'),
      reason:       'file-missing-on-worker',
      message:      'Some user-defined message',
    });

    debug('### Wait for artifact created message');
    await helper.events.waitFor('artifact-created');

    debug('### Downloading artifact');
    var url = helper.queue.buildUrl(
      helper.queue.getArtifact,
      taskId, 0, 'public/error.json',
    );
    debug('Fetching artifact from: %s', url);
    var res;
    try {
      res = await request.get(url).end();
    } catch (err) {
      res = err.response;
    }
    assume(res.ok).to.not.be.ok();
    assume(res.status).equals(403);
    assume(res.body.message).equals('Some user-defined message');

    debug('### Expire artifacts');
    // config/test.js hardcoded to expire artifact 4 days in the future
    await helper.expireArtifacts();

    debug('### Attempt to download artifact');
    await get404(url);
  });

  test('Post redirect artifact', async () => {
    var taskId = slugid.v4();

    debug('### Creating task');
    await helper.queue.createTask(taskId, taskDef);

    debug('### Claiming task');
    // First runId is always 0, so we should be able to claim it here
    await helper.queue.claimTask(taskId, 0, {
      workerGroup:    'my-worker-group',
      workerId:       'my-worker',
    });

    debug('### Send post artifact request');
    helper.scopes(
      'queue:create-artifact:public/redirect.json',
      'assume:worker-id:my-worker-group/my-worker'
    );
    await helper.queue.createArtifact(taskId, 0, 'public/redirect.json', {
      storageType:  'reference',
      expires:      taskcluster.fromNowJSON('1 day'),
      url:          'https://google.com',
      contentType:  'text/html',
    });

    debug('### Send post artifact request (again w. new URL)');
    var pingUrl = helper.queue.buildUrl(helper.queue.ping);
    await helper.queue.createArtifact(taskId, 0, 'public/redirect.json', {
      storageType:  'reference',
      expires:      taskcluster.fromNowJSON('1 day'),
      url:          pingUrl,
      contentType:  'text/html',
    });

    debug('### Downloading artifact');
    var url = helper.queue.buildUrl(
      helper.queue.getArtifact,
      taskId, 0, 'public/redirect.json',
    );
    debug('Fetching artifact from: %s', url);
    var res = await getWith303Redirect(url);
    assume(res.ok).is.ok();

    debug('### Expire artifacts');
    // config/test.js hardcoded to expire artifact 4 days in the future
    await helper.expireArtifacts();

    debug('### Attempt to download artifact');
    await get404(url);
  });

  test('Redirect artifact doesn\'t expire too soon', async () => {
    var taskId = slugid.v4();

    debug('### Creating task');
    await helper.queue.createTask(taskId, taskDef);

    debug('### Claiming task');
    // First runId is always 0, so we should be able to claim it here
    await helper.queue.claimTask(taskId, 0, {
      workerGroup:    'my-worker-group',
      workerId:       'my-worker',
    });

    debug('### Send post artifact request');
    await helper.queue.createArtifact(taskId, 0, 'public/redirect.json', {
      storageType:  'reference',
      expires:      taskcluster.fromNowJSON('12 day'),
      url:          'https://google.com',
      contentType:  'text/html',
    });

    debug('### Send post artifact request (again w. new URL)');
    var pingUrl = helper.queue.buildUrl(helper.queue.ping);
    await helper.queue.createArtifact(taskId, 0, 'public/redirect.json', {
      storageType:  'reference',
      expires:      taskcluster.fromNowJSON('12 day'),
      url:          pingUrl,
      contentType:  'text/html',
    });

    debug('### Downloading artifact');
    var url = helper.queue.buildUrl(
      helper.queue.getArtifact,
      taskId, 0, 'public/redirect.json',
    );
    debug('Fetching artifact from: %s', url);
    var res = await getWith303Redirect(url);
    assume(res.ok).is.ok();

    debug('### Expire artifacts');
    // config/test.js hardcoded to expire artifact 4 days in the future
    // In this test, we check that it doesn't expire...
    await helper.expireArtifacts();

    debug('### Downloading artifact');
    var url = helper.queue.buildUrl(
      helper.queue.getArtifact,
      taskId, 0, 'public/redirect.json',
    );
    debug('Fetching artifact from: %s', url);
    var res = await getWith303Redirect(url);
    assume(res.ok).is.ok();
  });

  test('Post artifact past resolution for \'exception\'', async () => {
    var taskId = slugid.v4();
    debug('### Creating task');
    await helper.queue.createTask(taskId, taskDef);

    debug('### Claiming task');
    // First runId is always 0, so we should be able to claim it here
    await helper.queue.claimTask(taskId, 0, {
      workerGroup:    'my-worker-group',
      workerId:       'my-worker',
    });

    debug('### Report exception');
    await helper.queue.reportException(taskId, 0, {
      reason:   'malformed-payload',
    });

    debug('### Send post artifact request');
    var r1 = await helper.queue.createArtifact(taskId, 0, 'public/s3.json', {
      storageType:  's3',
      expires:      taskcluster.fromNowJSON('1 day'),
      contentType:  'application/json',
    });
    assume(r1.putUrl).is.ok();
  });

  test('Can\'t post artifact past resolution for \'completed\'', async () => {
    var taskId = slugid.v4();
    debug('### Creating task');
    await helper.queue.createTask(taskId, taskDef);

    debug('### Claiming task');
    // First runId is always 0, so we should be able to claim it here
    await helper.queue.claimTask(taskId, 0, {
      workerGroup:    'my-worker-group',
      workerId:       'my-worker',
    });

    debug('### Report completed');
    await helper.queue.reportCompleted(taskId, 0);

    debug('### Send post artifact request');
    await helper.queue.createArtifact(taskId, 0, 'public/s3.json', {
      storageType:  's3',
      expires:      taskcluster.fromNowJSON('1 day'),
      contentType:  'application/json',
    }).catch(err => {
      assume(err.statusCode).equals(409);
    });
  });

  test('Can\'t post artifact past resolution for \'failed\'', async () => {
    var taskId = slugid.v4();
    debug('### Creating task');
    await helper.queue.createTask(taskId, taskDef);

    debug('### Claiming task');
    // First runId is always 0, so we should be able to claim it here
    await helper.queue.claimTask(taskId, 0, {
      workerGroup:    'my-worker-group',
      workerId:       'my-worker',
    });

    debug('### Report exception');
    await helper.queue.reportFailed(taskId, 0);

    debug('### Send post artifact request');
    await helper.queue.createArtifact(taskId, 0, 'public/s3.json', {
      storageType:  's3',
      expires:      taskcluster.fromNowJSON('1 day'),
      contentType:  'application/json',
    }).catch(err => {
      assume(err.statusCode).equals(409);
    });
  });

  test('Can update expiration of artifact', async () => {
    var taskId = slugid.v4();
    debug('### Creating task');
    await helper.queue.createTask(taskId, taskDef);

    debug('### Claiming task');
    // First runId is always 0, so we should be able to claim it here
    await helper.queue.claimTask(taskId, 0, {
      workerGroup:    'my-worker-group',
      workerId:       'my-worker',
    });

    var expirationIn1Day = taskcluster.fromNowJSON('1 day');
    var expirationIn2Days = taskcluster.fromNowJSON('2 days');

    debug('### Send post artifact request');
    await helper.queue.createArtifact(taskId, 0, 'public/s3.json', {
      storageType:  's3',
      expires:      expirationIn1Day,
      contentType:  'application/json',
    });

    debug('### Send second post artifact request to update expiration');
    await helper.queue.createArtifact(taskId, 0, 'public/s3.json', {
      storageType:  's3',
      expires:      expirationIn2Days,
      contentType:  'application/json',
    }).catch(err => {
      debug('Got error: %s, as JSON %j', err, err);
      throw err;
    });

    var artifacts = await helper.queue.listArtifacts(taskId, 0);

    debug('### reportCompleted');
    await helper.queue.reportCompleted(taskId, 0);

    var savedExpiration = new Date(artifacts.artifacts[0].expires).getTime();
    var originalExpiration = new Date(expirationIn1Day).getTime();

    assume(savedExpiration).is.greaterThan(originalExpiration);
  });

  test('Can not update content type of artifact', async () => {
    var taskId = slugid.v4();
    debug('### Creating task');
    await helper.queue.createTask(taskId, taskDef);

    debug('### Claiming task');
    // First runId is always 0, so we should be able to claim it here
    await helper.queue.claimTask(taskId, 0, {
      workerGroup:    'my-worker-group',
      workerId:       'my-worker',
    });

    debug('### Send post artifact request');
    await helper.queue.createArtifact(taskId, 0, 'public/s3.json', {
      storageType:  's3',
      expires:      taskcluster.fromNowJSON('1 day'),
      contentType:  'application/json',
    });

    debug('### Send second post artifact request to update content type');
    await helper.queue.createArtifact(taskId, 0, 'public/s3.json', {
      storageType:  's3',
      expires:      taskcluster.fromNowJSON('1 day'),
      contentType:  'text/plain',
    }).then(async () => {
      assume().fail('Expected request to be unsuccessful');
    }, async (err) => {
      debug('Got error: %s, as JSON %j', err, err);
      assume(err.message).includes('Artifact already exists');
      assume(err.body.error).contains('originalArtifact', 'newArtifact');
    });

    debug('### reportCompleted');
    await helper.queue.reportCompleted(taskId, 0);

    debug('### listArtifacts');
    var artifacts = await helper.queue.listArtifacts(taskId, 0);
    var artifact = artifacts.artifacts[0];

    // Ensure content type was not updated
    assume(artifact.contentType).equals('application/json');
  });

  test('listArtifacts (missing task)', async () => {
    await helper.queue.listArtifacts(slugid.v4(), 0).then(
      ()  => assert(false, 'Expected error'),
      err => assume(err.code).equals('ResourceNotFound'),
    );
  });

  test('listLatestArtifacts (missing task)', async () => {
    await helper.queue.listLatestArtifacts(slugid.v4(), 0).then(
      ()  => assert(false, 'Expected error'),
      err => assume(err.code).equals('ResourceNotFound'),
    );
  });

  test('listArtifacts, listLatestArtifacts (missing run)', async () => {
    debug('### Creating task');
    let taskId = slugid.v4();
    await helper.queue.defineTask(taskId, taskDef);

    debug('### listArtifacts (runId: 0, is missing)');
    await helper.queue.listArtifacts(taskId, 0).then(
      ()  => assert(false, 'Expected error'),
      err => assume(err.code).equals('ResourceNotFound'),
    );

    debug('### listLatestArtifacts (task has no runs)');
    await helper.queue.listLatestArtifacts(taskId).then(
      ()  => assert(false, 'Expected error'),
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
      ()  => assert(false, 'Expected error'),
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
      workerGroup:    'my-worker-group',
      workerId:       'my-worker',
    });

    debug('### Create two artifacts (don\'t upload anything to S3)');
    await Promise.all([
      helper.queue.createArtifact(taskId, 0, 'public/s3-A.json', {
        storageType:  's3',
        expires:      taskcluster.fromNowJSON('1 day'),
        contentType:  'application/json',
      }),
      helper.queue.createArtifact(taskId, 0, 'public/s3-B.json', {
        storageType:  's3',
        expires:      taskcluster.fromNowJSON('1 day'),
        contentType:  'application/json',
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
