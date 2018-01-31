/**
 * This module handles the creations of a dind-service container, links and sets
 * the DOCKER_HOST environment variables such that task container will be able
 * to use `docker`. For security reasons you can't run privileged containers,
 * use capabilities or volume mount host folders. But it should work out of the
 * box for common docker flows.
 */

const waitForSocket = require('../wait_for_socket');
const slugid = require('slugid');
const path = require('path');
const {makeDir, removeDir} = require('../util/fs');
let debug = require('debug')('docker-worker:features:dind');

// Maximum time to wait for dind-service to be ready
const INIT_TIMEOUT = 30 * 1000;

class DockerInDocker {
  constructor() {
    this.featureName = 'dind';
    // dind-service container
    this.container = null;
    this.tmpFolder = path.join('/tmp', slugid.v4());
  }

  async link(task) {
    let docker = task.runtime.docker;

    // Pull docker image
    debug('ensuring image');
    let imageManager = task.runtime.imageManager;
    let image = task.runtime.dindImage;
    let imageId = await imageManager.ensureImage(image, process.stdout, task);
    debug('image verified %s', imageId);

    // Create temporary directory
    await makeDir(this.tmpFolder);

    this.container = await docker.createContainer({
      Image: task.runtime.dindImage,
      AttachStdin: false,
      AttachStdout: false,
      AttachStderr: false,
      Env: ['PORT='],
      HostConfig: {
        Privileged: true,
        Binds: [`${this.tmpFolder}:/opt/dind-service/run`]
      }
    });

    // Terrible hack to get container promise proxy.
    this.container = docker.getContainer(this.container.id);

    // Start the container
    await this.container.start({});

    // Find socket path
    let socketPath = path.join(this.tmpFolder, 'docker.sock');

    try {
      await waitForSocket(socketPath, INIT_TIMEOUT);
    } catch(err) {
      debug('Failed to start dind-service');
      throw new Error('Failed to initialize dind-service waiting for socket');
    }
    debug('dind-service now running!');

    return {
      binds: [{
        source: socketPath,
        target: '/var/run/docker.sock',
        readOnly: true
      }]
    };
  }

  async killed(task) {
    task.runtime.gc.removeContainer(this.container.id);

    // Remove temporary folder, this should be possible even though container
    // is running... Well, maybe docker will complain that mounted folder is
    // deleted (delete socket while running is not a problem)
    await removeDir(this.tmpFolder);
  }
}

module.exports = DockerInDocker;
