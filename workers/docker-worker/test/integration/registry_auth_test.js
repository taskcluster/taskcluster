import assert from 'assert';
import slugid from 'slugid';

import cmd from './helper/cmd';
import Docker from '../../lib/docker';
import DockerWorker from '../dockerworker';
import Registry from './helper/docker_registry';
import * as settings from '../settings';
import TestWorker from '../testworker';

const CREDENTIALS = {
  username: 'testuser',
  password: 'testpassword',
  email: 'xfoo@g.com'
};

const IMAGE_NAME = 'busybox:latest';
const REPO_IMAGE_NAME = `${CREDENTIALS.username}/${IMAGE_NAME}`;

let registryProxy;
let worker;
let registryImageName;
let docker = Docker();

suite('Docker custom private registry', () => {
  suiteSetup(async () => {
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
    // For interfacing with the docker registry.
    worker = new TestWorker(DockerWorker, slugid.v4(), slugid.v4());
  });

  teardown(async () => {
    await worker.terminate();
    settings.cleanup();
    try {
      let image = await docker.getImage(registryImageName);
      await image.remove({force: true});
    } catch(e) {
      // 404's are ok if the test failed to pull the image
      if (e.statusCode !== 404) {
        throw e;
      }
    }
  });

  test('success', async () => {
    let registries = {};
    registries[registryProxy.imageName('')] = CREDENTIALS;
    settings.configure({registries: registries});

    await worker.launch();

    let result = await worker.postToQueue({
      scopes: ['docker-worker:image:' + registryImageName],
      payload: {
        image: registryImageName,
        command: cmd('ls'),
        maxRunTime: 60 * 60
      }
    });
    console.log(result.log);
    assert.equal(result.run.state, 'completed', 'auth download works');
    assert.equal(result.run.reasonResolved, 'completed', 'auth download works');
    assert.ok(result.log.includes(registryImageName), 'correct image name');
  });

  test('success - with star', async () => {
    let registries = {};
    registries[registryProxy.imageName('')] = CREDENTIALS;
    settings.configure({registries: registries});

    await worker.launch();

    let result = await worker.postToQueue({
      scopes: ['docker-worker:image:' + registryImageName.split('/')[0] + '/*'],
      payload: {
        image: registryImageName,
        command: cmd('ls'),
        maxRunTime: 60 * 60
      }
    });

    assert.equal(result.run.state, 'completed', 'auth download works');
    assert.equal(result.run.reasonResolved, 'completed', 'auth download works');
    assert.ok(result.log.includes(registryImageName), 'correct image name');
  });

  test('failed scopes', async () => {
    let registries = {};
    registries[registryProxy.imageName('')] = CREDENTIALS;
    settings.configure({registries: registries});

    await worker.launch();

    let result = await worker.postToQueue({
      scopes: [],
      payload: {
        image: registryImageName,
        command: cmd('ls'),
        maxRunTime: 60 * 60
      }
    });

    assert.equal(result.run.state, 'failed', 'auth download works');
    assert.equal(result.run.reasonResolved, 'failed', 'auth download works');
    assert.ok(result.log.includes(registryImageName), 'correct image name');
    assert.ok(result.log.includes('Not authorized to use'), 'correct error message');
  });

  test('failed auth', async () => {
    let registries = {};
    registries[registryProxy.imageName('')] = {
      username: 'fail', password: 'fail'
    };
    settings.configure({
      registries: registries,
      dockerConfig: {
        defaultRegistry: 'registry.hub.docker.com',
        maxAttempts: 1,
        delayFactor: 100,
        randomizationFactor: 0.25
      }
    });

    await worker.launch();

    let result = await worker.postToQueue({
      scopes: ['docker-worker:image:' + registryImageName],
      payload: {
        image: registryImageName,
        command: cmd('ls'),
        maxRunTime: 60 * 60
      }
    });

    assert.equal(result.run.state, 'failed', 'auth download works');
    assert.equal(result.run.reasonResolved, 'failed', 'auth download works');
    assert.ok(result.log.includes(registryImageName), 'correct image name');
    assert.ok(result.log.includes(`image ${REPO_IMAGE_NAME}`), 'authorization failed');
  });
});
