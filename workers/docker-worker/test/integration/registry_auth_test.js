const assert = require('assert');
const cmd = require('./helper/cmd');
const Docker = require('../../src/docker');
const DockerWorker = require('../dockerworker');
const Registry = require('./helper/docker_registry');
const settings = require('../settings');
const TestWorker = require('../testworker');
const { removeImage } = require('../../src/util/remove_image');
const { suiteName } = require('@taskcluster/lib-testing');
const helper = require('../helper');

const CREDENTIALS = {
  username: 'testuser',
  password: 'testpassword',
  email: 'xfoo@g.com',
};

const IMAGE_NAME = 'busybox:latest';
const REPO_IMAGE_NAME = `${CREDENTIALS.username}/${IMAGE_NAME}`;

let registryProxy;
let worker;
let registryImageName;
let docker = Docker();

helper.secrets.mockSuite(suiteName(), ['docker', 'ci-creds'], function(mock, skipping) {
  if (mock) {
    return; // no fake equivalent for integration tests
  }

  suiteSetup(async () => {
    if (skipping()) {
      return;
    }
    registryProxy = new Registry(docker);
    await registryProxy.start();
    registryImageName = await registryProxy.loadImageWithTag(IMAGE_NAME, CREDENTIALS);
  });

  suiteTeardown(async () => {
    if (registryProxy) {
      await registryProxy.close();
    }
  });

  setup(() => {
    if (skipping()) {
      return;
    }
    // For interfacing with the docker registry.
    worker = new TestWorker(DockerWorker);
  });

  teardown(async () => {
    await worker.terminate();
    settings.cleanup();
    try {
      await removeImage(docker, registryImageName);
    } catch (e) {
      // 404's are ok if the test failed to pull the image
      if (e.statusCode !== 404) {
        throw e;
      }
    }
  });

  test('success', async () => {
    let registries = {};
    registries[registryProxy.imageName('')] = CREDENTIALS;
    settings.configure({ registries: registries });

    await worker.launch();

    let result = await worker.postToQueue({
      scopes: ['docker-worker:image:' + registryImageName],
      payload: {
        image: registryImageName,
        command: cmd('ls'),
        maxRunTime: 60 * 60,
      },
    });

    console.log(result.log);

    assert.equal(result.run.state, 'completed', 'auth download works');
    assert.equal(result.run.reasonResolved, 'completed', 'auth download works');
    assert.ok(result.log.includes(registryImageName), 'correct image name');

    await worker.terminate();
  });

  test('success - with star', async () => {
    let registries = {};
    registries[registryProxy.imageName('')] = CREDENTIALS;
    settings.configure({ registries: registries });

    await worker.launch();

    let result = await worker.postToQueue({
      scopes: ['docker-worker:image:' + registryImageName.split('/')[0] + '/*'],
      payload: {
        image: registryImageName,
        command: cmd('ls'),
        maxRunTime: 60 * 60,
      },
    });

    assert.equal(result.run.state, 'completed', 'auth download works');
    assert.equal(result.run.reasonResolved, 'completed', 'auth download works');
    assert.ok(result.log.includes(registryImageName), 'correct image name');

    await worker.terminate();
  });

  test('failed scopes', async () => {
    let registries = {};
    registries[registryProxy.imageName('')] = CREDENTIALS;
    settings.configure({ registries: registries });

    await worker.launch();

    let result = await worker.postToQueue({
      scopes: [],
      payload: {
        image: registryImageName,
        command: cmd('ls'),
        maxRunTime: 60 * 60,
      },
    });

    assert.equal(result.run.state, 'failed', 'auth download works');
    assert.equal(result.run.reasonResolved, 'failed', 'auth download works');
    assert.ok(result.log.includes(registryImageName), 'correct image name');
    assert.ok(result.log.includes('Not authorized to use'), 'correct error message');

    await worker.terminate();
  });

  test('failed auth', async () => {
    let registries = {};
    registries[registryProxy.imageName('')] = {
      username: 'fail', password: 'fail',
    };
    settings.configure({
      registries: registries,
      dockerConfig: {
        defaultRegistry: 'registry.hub.docker.com',
        maxAttempts: 1,
        delayFactor: 100,
        randomizationFactor: 0.25,
      },
    });

    await worker.launch();

    let result = await worker.postToQueue({
      scopes: ['docker-worker:image:' + registryImageName],
      payload: {
        image: registryImageName,
        command: cmd('ls'),
        maxRunTime: 60 * 60,
      },
    });

    assert.equal(result.run.state, 'failed', 'auth download works');
    assert.equal(result.run.reasonResolved, 'failed', 'auth download works');
    assert.ok(
      result.log.includes(`image ${REPO_IMAGE_NAME} not found`)
      || result.log.includes('unauthorized'),
      'authorization failed',
    );

    await worker.terminate();
  });
});
