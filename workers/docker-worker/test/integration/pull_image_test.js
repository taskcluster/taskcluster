suite('pull image', function() {
  var assert = require('assert');
  var co = require('co');
  var testworker = require('../post_task');
  var docker = require('../../lib/docker')();
  var dockerUtils = require('dockerode-process/utils');
  var cmd = require('./helper/cmd');
  var slugid = require('slugid');
  var expires = require('./helper/expires');
  var NAMESPACE = require('../fixtures/image_artifacts').NAMESPACE;
  var TASK_ID = require('../fixtures/image_artifacts').TASK_ID;
  var createHash = require('crypto').createHash;

  test('ensure docker image can be pulled', co(function* () {
    let image = 'gliderlabs/alpine:latest';
    yield dockerUtils.removeImageIfExists(docker, image);
    var result = yield testworker({
      payload: {
        image: image,
        command: cmd('ls'),
        maxRunTime: 5 * 60
      }
    });

    assert.equal(result.run.state, 'completed', 'task should be successful');
    assert.equal(result.run.reasonResolved, 'completed', 'task should be successful');
  }));

  test('ensure public image from a task can be pulled', async () => {
    let image = {
      type: 'task-image',
      taskId: TASK_ID,
      path: 'public/image.tar'
    };

    let hashedName = createHash('md5')
                      .update(`${TASK_ID}${image.path}`)
                      .digest('hex');

    await dockerUtils.removeImageIfExists(docker, hashedName);


    let result = await testworker({
      payload: {
        image: image,
        command: cmd('ls /bin'),
        maxRunTime: 5 * 60
      }
    });

    assert.equal(result.run.state, 'completed', 'task should be successful');
    assert.equal(result.run.reasonResolved, 'completed', 'task should be successful');
    assert.ok(result.log.includes('busybox'), 'Does not appear to be the correct image with busybox');
  });


  test('ensure public indexed image can be pulled', async () => {
    let image = {
      type: 'indexed-image',
      namespace: NAMESPACE,
      path: 'public/image.tar'
    };

    let hashedName = createHash('md5')
                      .update(`${TASK_ID}${image.path}`)
                      .digest('hex');

    await dockerUtils.removeImageIfExists(docker, hashedName);

    let result = await testworker({
      payload: {
        image: image,
        command: cmd('ls /bin'),
        maxRunTime: 5 * 60
      }
    });

    assert.ok(result.log.includes('busybox'), 'Does not appear to be the correct image with busybox');
    assert.equal(result.run.state, 'completed', 'task should be successful');
    assert.equal(result.run.reasonResolved, 'completed', 'task should be successful');
  });

  test('ensure private indexed image can be pulled', async () => {
    let image = {
      type: 'indexed-image',
      namespace: NAMESPACE,
      path: 'private/docker-worker-tests/image.tar'
    };

    let hashedName = createHash('md5')
                      .update(`${TASK_ID}${image.path}`)
                      .digest('hex');

    await dockerUtils.removeImageIfExists(docker, hashedName);

    let result = await testworker({
      scopes: ['queue:get-artifact:private/docker-worker-tests/image.tar'],
      payload: {
        image: image,
        command: cmd('ls /bin'),
        maxRunTime: 5 * 60
      }
    });

    assert.ok(result.log.includes('busybox'), 'Does not appear to be the correct image with busybox');
    assert.equal(result.run.state, 'completed', 'task should be successful');
    assert.equal(result.run.reasonResolved, 'completed', 'task should be successful');
  });

  test('task marked as failed if private image is specified without proper scopes', async () => {
    let image = {
      type: 'indexed-image',
      namespace: NAMESPACE,
      path: 'private/docker-worker-tests/image.tar'
    };

    let hashedName = createHash('md5')
                      .update(`${TASK_ID}${image.path}`)
                      .digest('hex');

    await dockerUtils.removeImageIfExists(docker, hashedName);

    let result = await testworker({
      payload: {
        image: image,
        command: cmd('ls /bin'),
        maxRunTime: 5 * 60
      }
    });

    assert.ok(result.log.includes('Not authorized to use'), 'Not Authorized error message did not appear in logs');
    assert.equal(result.run.state, 'failed', 'task should have failed');
    assert.equal(result.run.reasonResolved, 'failed', 'task should have failed');
  });

  test('Task marked as failed if non-existent image is specified', co(function* () {
    var result = yield testworker({
      payload: {
        image: 'ubuntu:99.99',
        command: cmd('ls'),
        maxRunTime: 5 * 60
      }
    });
    assert.equal(result.run.state, 'failed', 'task should be successful');
    assert.equal(result.run.reasonResolved, 'failed', 'task should be successful');
  }));
});

