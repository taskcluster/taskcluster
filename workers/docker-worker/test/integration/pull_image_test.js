import assert from 'assert';
import testworker from '../post_task';
import Docker from '../../build/lib/docker';
import cmd from './helper/cmd';
import {ZSTD_TASK_ID, LZ4_TASK_ID, TASK_ID, NAMESPACE} from '../fixtures/image_artifacts';
import {createHash} from 'crypto';
import {removeImage} from '../../build/lib/util/remove_image';

let docker = Docker();

suite('pull image', () => {

  test('ensure docker image can be pulled', async () => {
    let image = 'gliderlabs/alpine:latest';
    await removeImage(docker, image);

    let result = await testworker({
      payload: {
        image: image,
        command: cmd('ls'),
        maxRunTime: 5 * 60
      }
    });

    assert.equal(result.run.state, 'completed', 'task should be successful');
    assert.equal(result.run.reasonResolved, 'completed', 'task should be successful');
  });

  test('ensure public image from a task can be pulled', async () => {
    let image = {
      type: 'task-image',
      taskId: TASK_ID,
      path: 'public/image.tar'
    };

    let hashedName = createHash('md5')
                      .update(`${TASK_ID}${image.path}`)
                      .digest('hex');

    await removeImage(docker, hashedName);

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

  test('ensure public lz4 compressed image from a task can be pulled', async () => {
    let image = {
      type: 'task-image',
      taskId: LZ4_TASK_ID,
      path: 'public/image.tar.lz4'
    };

    let hashedName = createHash('md5')
                      .update(`${LZ4_TASK_ID}${image.path}`)
                      .digest('hex');

    await removeImage(docker, hashedName);

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

  test('ensure public zstd compressed image from a task can be pulled', async () => {
    let image = {
      type: 'task-image',
      taskId: ZSTD_TASK_ID,
      path: 'public/image.tar.zst'
    };

    let hashedName = createHash('md5')
                      .update(`${ZSTD_TASK_ID}${image.path}`)
                      .digest('hex');

    await removeImage(docker, hashedName);

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

    await removeImage(docker, hashedName);

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

    await removeImage(docker, hashedName);

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

    await removeImage(docker, hashedName);

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

  test('Task marked as failed if non-existent image is specified', async () => {
    var result = await testworker({
      payload: {
        image: 'ubuntu:99.99',
        command: cmd('ls'),
        maxRunTime: 5 * 60
      }
    });
    assert.equal(result.run.state, 'failed', 'task should be successful');
    assert.equal(result.run.reasonResolved, 'failed', 'task should be successful');
  });
});

