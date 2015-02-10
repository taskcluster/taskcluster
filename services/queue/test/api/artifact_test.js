suite('Post artifacts', function() {
  var debug         = require('debug')('test:api:claim');
  var assert        = require('assert');
  var slugid        = require('slugid');
  var _             = require('lodash');
  var Promise       = require('promise');
  var request       = require('superagent-promise');
  var assert        = require('assert');
  var urljoin       = require('url-join');
  var BlobUploader  = require('../queue/azure-blob-uploader-sas');
  var Bucket        = require('../../queue/bucket');
  var BlobStore     = require('../../queue/blobstore');
  var data          = require('../../queue/data');
  var base          = require('taskcluster-base');
  var taskcluster   = require('taskcluster-client');
  var expect        = require('expect.js');
  var helper        = require('./helper')();

  // Use the same task definition for everything
  var taskDef = {
    provisionerId:    'no-provisioner',
    workerType:       'test-worker',
    schedulerId:      'my-scheduler',
    taskGroupId:      'dSlITZ4yQgmvxxAi4A8fHQ',
    routes:           [],
    retries:          5,
    created:          taskcluster.utils.fromNow(),
    deadline:         taskcluster.utils.fromNow('3 days'),
    scopes:           [],
    payload:          {},
    metadata: {
      name:           "Unit testing task",
      description:    "Task created during unit tests",
      owner:          'jonsafj@mozilla.com',
      source:         'https://github.com/taskcluster/taskcluster-queue'
    },
    tags: {
      purpose:        'taskcluster-testing'
    }
  };
  this.timeout(3 * 60 * 1000);

  test("Post S3 artifact", async () => {
    var taskId = slugid.v4();
    debug("### Creating task");
    await helper.queue.createTask(taskId, taskDef);

    debug("### Claiming task");
    // First runId is always 0, so we should be able to claim it here
    await helper.queue.claimTask(taskId, 0, {
      workerGroup:    'my-worker-group',
      workerId:       'my-worker'
    });

    debug("### Send post artifact request");
    helper.scopes(
      'queue:create-artifact:public/s3.json',
      'assume:worker-id:my-worker-group/my-worker'
    );
    var r1 = await helper.queue.createArtifact(taskId, 0, 'public/s3.json', {
      storageType:  's3',
      expires:      taskcluster.utils.fromNow('1 day'),
      contentType:  'application/json'
    });
    expect(r1.putUrl).to.be.ok();

    debug("### Uploading to putUrl");
    var res = await request.put(r1.putUrl).send({message: "Hello World"}).end();
    expect(res.ok).to.be.ok();

    debug("### Download Artifact (runId: 0)");
    var url = helper.queue.buildUrl(
      helper.queue.getArtifact,
      taskId, 0, 'public/s3.json'
    );
    debug("Fetching artifact from: %s", url);
    res = await request.get(url).end();
    expect(res.ok).to.be.ok();
    expect(res.body).to.be.eql({message: "Hello World"});

    debug("### Download Artifact (latest)");
    var url = helper.queue.buildUrl(
      helper.queue.getLatestArtifact,
      taskId, 'public/s3.json'
    );
    debug("Fetching artifact from: %s", url);
    res = await request.get(url).end();
    expect(res.ok).to.be.ok();
    expect(res.body).to.be.eql({message: "Hello World"});

    debug("### List artifacts");
    var r2 = await helper.queue.listArtifacts(taskId, 0);
    expect(r2.artifacts.length).to.be(1);

    debug("### List artifacts from latest run");
    var r3 = await helper.queue.listLatestArtifacts(taskId);
    expect(r3.artifacts.length).to.be(1);

    debug("### Expire artifacts");
    // config/test.js hardcoded to expire artifact 4 days in the future
    await helper.expireArtifacts();

    debug("### Attempt to download Artifact (runId: 0)");
    var url = helper.queue.buildUrl(
      helper.queue.getArtifact,
      taskId, 0, 'public/s3.json'
    );
    debug("Fetching artifact from: %s", url);
    res = await request.get(url).end();
    expect(res.ok).to.not.be.ok();
    expect(res.status).to.be(404);
  });


  test("Post S3 artifact (with bad scopes)", async () => {
    var taskId = slugid.v4();
    debug("### Creating task");
    await helper.queue.createTask(taskId, taskDef);

    debug("### Claiming task");
    // First runId is always 0, so we should be able to claim it here
    await helper.queue.claimTask(taskId, 0, {
      workerGroup:    'my-worker-group',
      workerId:       'my-worker'
    });

    debug("### Send post artifact request");
    helper.scopes(
      'queue:create-artifact:public/another-s3.json',
      'assume:worker-id:my-worker-group/my-worker'
    );
    await helper.queue.createArtifact(taskId, 0, 'public/s3.json', {
      storageType:  's3',
      expires:      taskcluster.utils.fromNow('1 day'),
      contentType:  'application/json'
    }).then(() => {
      expect().fail("Expected authentication error");
    }, (err) => {
      debug("Got expected authentication error: %s", err);
    });
  });


  test("Post Azure artifact", async () => {
    var taskId = slugid.v4();

    debug("### Creating task");
    await helper.queue.createTask(taskId, taskDef);

    debug("### Claiming task");
    // First runId is always 0, so we should be able to claim it here
    await helper.queue.claimTask(taskId, 0, {
      workerGroup:    'my-worker-group',
      workerId:       'my-worker'
    });

    debug("### Send post artifact request");
    helper.scopes(
      'queue:create-artifact:public/azure.json',
      'assume:worker-id:my-worker-group/my-worker'
    );
    var r1 = await helper.queue.createArtifact(taskId, 0, 'public/azure.json', {
      storageType:  'azure',
      expires:      taskcluster.utils.fromNow('1 day'),
      contentType:  'application/json'
    });


    debug("### Uploading blocks");
    var block1 = slugid.v4();
    var block2 = slugid.v4();
    var uploader = new BlobUploader(r1.putUrl);
    await Promise.all([
      uploader.putBlock(block1, '{"block1_says": "Hello world",\n'),
      uploader.putBlock(block2, '"block2_says": "Hello Again"}\n')
    ]);

    debug("### Committing blocks");
    await uploader.putBlockList([block1, block2], 'application/json');

    debug("### Downloading artifact");
    var url = helper.queue.buildUrl(
      helper.queue.getArtifact,
      taskId, 0, 'public/azure.json'
    );
    debug("Fetching artifact from: %s", url);
    var res = await request.get(url).end();
    expect(res.ok).to.be.ok();
    expect(res.body).to.be.eql({
      block1_says: "Hello world",
      block2_says: "Hello Again"
    });

    debug("### Expire artifacts");
    // config/test.js hardcoded to expire artifact 4 days in the future
    await helper.expireArtifacts();

    debug("### Attempt to download artifact");
    res = await request.get(url).end();
    expect(res.ok).to.not.be.ok();
    expect(res.status).to.be(404);
  });


  test("Post error artifact", async () => {
    var taskId = slugid.v4();
    var artifactCreated;

    debug("### Creating task");
    await helper.queue.createTask(taskId, taskDef);

    debug("### Claiming task");
    // First runId is always 0, so we should be able to claim it here
    await helper.queue.claimTask(taskId, 0, {
      workerGroup:    'my-worker-group',
      workerId:       'my-worker'
    });

    debug("### Start listenFor for artifact created message");
    await helper.events.listenFor(
      'artifact-created',
      helper.queueEvents.artifactCreated({
        taskId:   taskId
      })
    );

    debug("### Send post artifact request");
    helper.scopes(
      'queue:create-artifact:public/error.json',
      'assume:worker-id:my-worker-group/my-worker'
    );
    await helper.queue.createArtifact(taskId, 0, 'public/error.json', {
      storageType:  'error',
      expires:      taskcluster.utils.fromNow('1 day'),
      reason:       'file-missing-on-worker',
      message:      "Some user-defined message",
    });

    debug("### Wait for artifact created message");
    await helper.events.waitFor('artifact-created');

    debug("### Downloading artifact");
    var url = helper.queue.buildUrl(
      helper.queue.getArtifact,
      taskId, 0, 'public/error.json'
    );
    debug("Fetching artifact from: %s", url);
    var res = await request.get(url).end();
    expect(res.ok).to.not.be.ok();
    expect(res.status).to.be(403);
    expect(res.body.message).to.be("Some user-defined message");

    debug("### Expire artifacts");
    // config/test.js hardcoded to expire artifact 4 days in the future
    await helper.expireArtifacts();

    debug("### Attempt to download artifact");
    res = await request.get(url).end();
    expect(res.ok).to.not.be.ok();
    expect(res.status).to.be(404);
  });

  test("Post redirect artifact", async () => {
    var taskId = slugid.v4();

    debug("### Creating task");
    await helper.queue.createTask(taskId, taskDef);

    debug("### Claiming task");
    // First runId is always 0, so we should be able to claim it here
    await helper.queue.claimTask(taskId, 0, {
      workerGroup:    'my-worker-group',
      workerId:       'my-worker'
    });

    debug("### Send post artifact request");
    helper.scopes(
      'queue:create-artifact:public/redirect.json',
      'assume:worker-id:my-worker-group/my-worker'
    );
    await helper.queue.createArtifact(taskId, 0, 'public/redirect.json', {
      storageType:  'reference',
      expires:      taskcluster.utils.fromNow('1 day'),
      url:          'https://google.com',
      contentType:  'text/html'
    });

    debug("### Send post artifact request (again w. new URL)");
    var pingUrl = helper.queue.buildUrl(helper.queue.ping);
    await helper.queue.createArtifact(taskId, 0, 'public/redirect.json', {
      storageType:  'reference',
      expires:      taskcluster.utils.fromNow('1 day'),
      url:          pingUrl,
      contentType:  'text/html'
    });

    debug("### Downloading artifact");
    var url = helper.queue.buildUrl(
      helper.queue.getArtifact,
      taskId, 0, 'public/redirect.json'
    );
    debug("Fetching artifact from: %s", url);
    var res = await request.get(url).end();
    expect(res.ok).to.be.ok();
    expect(res.redirects).to.contain(pingUrl);

    debug("### Expire artifacts");
    // config/test.js hardcoded to expire artifact 4 days in the future
    await helper.expireArtifacts();

    debug("### Attempt to download artifact");
    res = await request.get(url).end();
    expect(res.ok).to.not.be.ok();
    expect(res.status).to.be(404);
  });
});
