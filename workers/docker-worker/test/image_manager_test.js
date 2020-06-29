const assert = require('assert');
const dockerUtils = require('dockerode-process/utils');
const ImageManager = require('../src/lib/docker/image_manager');
const Docker = require('../src/lib/docker');
const {createHash} = require('crypto');
const slugid = require('slugid');
const {createLogger} = require('../src/lib/log');
const {NAMESPACE, TASK_ID, ROOT_URL} = require('./fixtures/image_artifacts');
const taskcluster = require('taskcluster-client');
const monitor = require('./fixtures/monitor');
const {suiteName} = require('taskcluster-lib-testing');
const helper = require('./helper');

let docker = Docker();

const DOCKER_CONFIG = {
  defaultRegistry: 'registry.hub.docker.com',
  maxAttempts: 5,
  delayFactor: 1,
  randomizationFactor: 0.25,
};

helper.secrets.mockSuite(suiteName(), ['docker'], function(mock, skipping) {
  if (mock) {
    return; // Only test with docker
  }

  test('download docker image from registry', async () => {
    let image = 'gliderlabs/alpine:latest';
    await dockerUtils.removeImageIfExists(docker, image);
    let runtime = {
      docker: docker,
      dockerConfig: DOCKER_CONFIG,
      log: createLogger(),
      monitor: monitor,
      rootUrl: ROOT_URL,
    };

    let im = new ImageManager(runtime);
    runtime.imageManager = im;
    let imageId1 = await im.ensureImage(image, process.stdout);
    let imageId2 = await im.ensureImage(image, process.stdout);

    assert.equal(imageId1, imageId2, 'Image IDs for the same image should be the same');
  });

  test('download public image from task', async () => {
    let image = {
      type: 'task-image',
      taskId: TASK_ID,
      path: 'public/image.tar',
    };

    let hashedName = createHash('md5')
      .update(`${TASK_ID}${image.path}`)
      .digest('hex');

    await dockerUtils.removeImageIfExists(docker, hashedName);

    let runtime = {
      docker: docker,
      dockerConfig: DOCKER_CONFIG,
      dockerVolume: '/tmp',
      log: createLogger(),
      monitor: monitor,
      rootUrl: ROOT_URL,
    };

    let task = {
      queue: new taskcluster.Queue({
        rootUrl: ROOT_URL,
        credentials: undefined,
        scopes: [],
      }),
    };

    let im = new ImageManager(runtime);
    runtime.imageManager = im;
    let imageId1 = await im.ensureImage(image, process.stdout, task, []);
    let imageId2 = await im.ensureImage(image, process.stdout, task);

    assert.ok(imageId1, 'No image id was returned');
    assert.equal(imageId1, imageId2, 'Image IDs for the same image should be the same');
  });

  test('download indexed public image', async () => {
    let image = {
      type: 'indexed-image',
      namespace: NAMESPACE,
      path: 'public/image.tar',
    };

    let index = new taskcluster.Index({
      rootUrl: ROOT_URL,
    });
    let {taskId} = await index.findTask(image.namespace);
    let hashedName = createHash('md5')
      .update(`${taskId}${image.path}`)
      .digest('hex');

    await dockerUtils.removeImageIfExists(docker, hashedName);

    let runtime = {
      docker: docker,
      dockerConfig: DOCKER_CONFIG,
      dockerVolume: '/tmp',
      log: createLogger(),
      monitor: monitor,
      rootUrl: ROOT_URL,
    };

    let task = {
      queue: new taskcluster.Queue({
        rootUrl: ROOT_URL,
        credentials: undefined,
        scopes: [],
      }),
    };

    let im = new ImageManager(runtime);
    runtime.imageManager = im;
    let imageId = await im.ensureImage(image, process.stdout, task, []);

    assert.ok(imageId, 'No image id was returned');
  });

  test('private indexed image cannot be used without proper scopes', async () => {
    let image = {
      type: 'indexed-image',
      namespace: NAMESPACE,
      path: 'private/docker-worker-tests/image.tar',
    };

    let index = new taskcluster.Index({
      rootUrl: ROOT_URL,
    });
    let {taskId} = await index.findTask(image.namespace);
    let hashedName = createHash('md5')
      .update(`${taskId}${image.path}`)
      .digest('hex');

    await dockerUtils.removeImageIfExists(docker, hashedName);

    let runtime = {
      docker: docker,
      dockerConfig: DOCKER_CONFIG,
      dockerVolume: '/tmp',
      log: createLogger(),
      monitor: monitor,
      rootUrl: ROOT_URL,
    };

    let task = {
      queue: new taskcluster.Queue({
        rootUrl: ROOT_URL,
        credentials: undefined,
        scopes: [],
      }),
    };

    let im = new ImageManager(runtime);
    runtime.imageManager = im;
    try {
      await im.ensureImage(image, process.stdout, task, []);
      assert.ok(false, 'Images should not be used when proper scopes are not provided');
    } catch(e) {
      return;
    }
  });

  test('temporary files removed after loading indexed public image', async () => {
    let image = {
      type: 'indexed-image',
      namespace: NAMESPACE,
      path: 'public/image.tar',
    };

    let index = new taskcluster.Index({
      rootUrl: ROOT_URL,
    });
    let {taskId} = await index.findTask(image.namespace);
    let hashedName = createHash('md5')
      .update(`${taskId}${image.path}`)
      .digest('hex');

    await dockerUtils.removeImageIfExists(docker, hashedName);

    let runtime = {
      docker: docker,
      dockerConfig: DOCKER_CONFIG,
      dockerVolume: '/tmp',
      log: createLogger(),
      monitor: monitor,
      rootUrl: ROOT_URL,
    };

    let task = {
      queue: new taskcluster.Queue({
        rootUrl: ROOT_URL,
        credentials: undefined,
        scopes: [],
      }),
    };

    let im = new ImageManager(runtime);
    runtime.imageManager = im;
    let imageId = await im.ensureImage(image, process.stdout, task, []);

    assert.ok(imageId, 'No image id was returned');
  });

  test('task not present for indexed image', async () => {
    let image = {
      type: 'indexed-image',
      namespace: slugid.nice(),
      path: 'public/image.tar',
    };

    let runtime = {
      docker: docker,
      dockerConfig: DOCKER_CONFIG,
      dockerVolume: '/tmp',
      log: createLogger(),
      monitor: monitor,
      rootUrl: ROOT_URL,
    };

    let task = {
      queue: new taskcluster.Queue({
        rootUrl: ROOT_URL,
        credentials: undefined,
        scopes: [],
      }),
    };

    let im = new ImageManager(runtime);
    runtime.imageManager = im;
    try {
      await im.ensureImage(image, process.stdout, task, []);
      assert.ok(false, 'Exception should have been thrown');
    } catch(e) {
      assert.ok(
        e.message.includes('Could not find a task associated'),
        'Error message did not appear indicating a task could not be found.',
      );
    }
  });

  test('artifact not present for indexed image', async () => {
    let image = {
      type: 'indexed-image',
      namespace: NAMESPACE,
      path: 'public/image1.tar',
    };

    let runtime = {
      docker: docker,
      dockerConfig: DOCKER_CONFIG,
      dockerVolume: '/tmp',
      log: createLogger(),
      monitor: monitor,
      rootUrl: ROOT_URL,
    };

    let task = {
      queue: new taskcluster.Queue({
        rootUrl: ROOT_URL,
        credentials: undefined,
        scopes: [],
      }),
    };

    let im = new ImageManager(runtime);
    runtime.imageManager = im;
    try {
      await im.ensureImage(image, process.stdout, task, []);
      assert.ok(false, 'Exception should have been thrown');
    } catch(e) {
      assert.ok(
        e.message.includes('Could not download artifact'),
        `Error message did not appear indicating an artifact could not be found. ${e.message}`,
      );
    }
  });

  test('failure when using unrecognied image type', async () => {
    let image = {
      type: 'garbage-image',
      path: 'public/image1.tar',
    };

    let runtime = {
      docker: docker,
      dockerConfig: DOCKER_CONFIG,
      dockerVolume: '/tmp',
      log: createLogger(),
      monitor: monitor,
      rootUrl: ROOT_URL,
    };

    let task = {
      queue: new taskcluster.Queue({
        rootUrl: ROOT_URL,
        credentials: undefined,
        scopes: [],
      }),
    };

    let im = new ImageManager(runtime);
    runtime.imageManager = im;
    try {
      await im.ensureImage(image, process.stdout, task, []);
      assert.ok(false, 'Exception should have been thrown');
    } catch(e) {
      assert.ok(
        e.message.includes('Unrecognized image type'),
        `Error message did not appear indicating unrecognized image type was used. ${e.message}`,
      );
    }
  });

  helper.secrets.mockSuite(suiteName(), ['docker', 'ci-creds'], function(mock, skipping) {
    if (mock) {
      return; // TODO: support this with a mock implementation
    }

    test('private indexed image can be used', async () => {
      const ciCreds = helper.secrets.get('ci-creds');
      assert.equal(
        ROOT_URL, ciCreds.rootUrl,
        `Credentials must be for ${ROOT_URL}, as that is the deployment containing the pre-created task`);

      let image = {
        type: 'indexed-image',
        namespace: NAMESPACE,
        path: 'private/docker-worker-tests/image.tar',
      };

      let scopes = ['queue:get-artifact:private/docker-worker-tests/image.tar'];

      let index = new taskcluster.Index({
        rootUrl: ROOT_URL,
      });
      let {taskId} = await index.findTask(image.namespace);
      let hashedName = createHash('md5')
        .update(`${taskId}${image.path}`)
        .digest('hex');

      await dockerUtils.removeImageIfExists(docker, hashedName);

      let runtime = {
        docker: docker,
        dockerConfig: DOCKER_CONFIG,
        dockerVolume: '/tmp',
        log: createLogger(),
        monitor: monitor,
        rootUrl: ROOT_URL,
      };

      let task = {
        queue: new taskcluster.Queue(helper.optionsFromCiCreds()),
      };

      let im = new ImageManager(runtime);
      runtime.imageManager = im;
      let imageId = await im.ensureImage(image, process.stdout, task, scopes);

      assert.ok(imageId, 'Image should have been loaded');
    });
  });
});
