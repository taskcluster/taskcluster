const slugid = require('slugid');
const settings = require('../settings');
const Docker = require('../../src/lib/docker');
const cmd = require('./helper/cmd');
const DockerWorker = require('../dockerworker');
const TestWorker = require('../testworker');
const waitForEvent = require('../../src/lib/wait_for_event');
const assert = require('assert');

let docker = new Docker();

suite('Container garbage collection tests', () => {

  async function sleep(duration) {
    return new Promise(accept => setTimeout(accept, duration));
  }

  setup(() => {
    settings.cleanup();
  });

  teardown(async () => {
    settings.cleanup();
  });

  test('containers removed after task completes', async () => {
    settings.configure({
      capacityManagement: {
        diskspaceThreshold: 10 * 1000000000
      },
      garbageCollection: {
        imageExpiration: 2 * 60 * 60 * 1000,
        interval: 15 * 1000,
        dockerVolume: '/mnt'
      }
    });

    let uniqueId = slugid.v4();
    let task = {
      payload: {
        env: {
          ID: uniqueId
        },
        image: 'taskcluster/test-ubuntu',
        command: cmd(
          'sleep 10'
        ),
        features: {
          localLiveLog: false
        },
        cache: {},
        maxRunTime: 20
      }
    };

    let worker = new TestWorker(DockerWorker);
    await worker.launch();

    // Wait at least one cycle to make sure lingering containers are cleaned up
    await waitForEvent(worker, 'garbage collection finished');

    worker.postToQueue(task);
    await waitForEvent(worker, 'task run');
    // Wait for container to come up
    await sleep(5000);

    let containers = await docker.listContainers();
    let containerId;
    // Find container for the task just launched
    for(let container of containers) {
      let dockerContainer = docker.getContainer(container.Id);
      let containerInspect = await dockerContainer.inspect();
      if (containerInspect.Config.Env.indexOf(`ID=${uniqueId}`) !== -1) {
        containerId = container.Id;
        break;
      }
    }
    assert.ok(containerId, 'Could not find container id for running task');
    let containerRemoved = await waitForEvent(worker, 'container removed');
    assert.ok(
      containerId === containerRemoved.container,
      'Container removed does not match the task container'
    );
    await worker.terminate();
  });

  test('containers removed after task exceeds max run time', async () => {
    settings.configure({
      capacityManagement: {
        diskspaceThreshold: 10 * 1000000000
      },
      garbageCollection: {
        imageExpiration: 2 * 60 * 60 * 1000,
        interval: 15 * 1000,
        dockerVolume: '/mnt'
      }
    });

    let uniqueId = slugid.v4();
    let task = {
      payload: {
        env: {
          ID: uniqueId
        },
        image: 'taskcluster/test-ubuntu',
        command: cmd(
          'sleep 20'
        ),
        features: {
          localLiveLog: false
        },
        cache: {},
        maxRunTime: 10
      }
    };

    let worker = new TestWorker(DockerWorker);
    await worker.launch();

    // Wait at least one cycle to make sure lingering containers are cleaned up
    await waitForEvent(worker, 'garbage collection finished');

    worker.postToQueue(task);
    await waitForEvent(worker, 'task run');
    // Wait for container to come up
    await sleep(5000);

    let containers = await docker.listContainers();
    let containerId;
    // Find container for the task just launched
    for(let container of containers) {
      let dockerContainer = docker.getContainer(container.Id);
      let containerInspect = await dockerContainer.inspect();
      if (containerInspect.Config.Env.indexOf(`ID=${uniqueId}`) !== -1) {
        containerId = container.Id;
        break;
      }
    }
    assert.ok(containerId, 'Could not find container id for running task');
    let containerRemoved = await waitForEvent(worker, 'container removed');
    assert.ok(
      containerId === containerRemoved.container,
      'Container removed does not match the task container'
    );
    await worker.terminate();
  });
});
