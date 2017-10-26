/**
This module handles the creation of the "relengapi" proxy container which
allows tasks to talk directly to releng api over a http proxy which
grants a particular permission level based on the task scopes.
*/
const waitForPort = require('../wait_for_port');

// Alias used to link the proxy.
const ALIAS = 'relengapi';

// Maximum time in MS to wait for the proxy socket to become available. Set to
// 30 seconds which is the max timeout on heroku for api calls. Note: very rarely
// should it take this long.
const INIT_TIMEOUT = 30000;

class RelengAPIProxy {
  constructor () {
    this.featureName = 'relengAPIProxy';
    /**
    Docker container used in the linking process.
    */
    this.container = null;
  }

  async link(task) {
    var docker = task.runtime.docker;

    // Image name for the proxy container.
    var image = task.runtime.features.relengAPIProxy.image;
    var imageId = await task.runtime.imageManager.ensureImage(image, process.stdout, task);

    var cmd = [
        `--relengapi-token=${task.runtime.features.relengAPIProxy.token}`,
        '--',
        task.status.taskId
    ];

    // create the container.
    this.container = await docker.createContainer({
      Image: imageId,

      Tty: true,
      AttachStdin: false,
      AttachStdout: true,
      AttachStderr: true,

      Cmd: cmd
    });

    // Terrible hack to get container promise proxy.
    this.container = docker.getContainer(this.container.id);

    // XXX: Temporary work around to get errors from the container.  Replace this
    // with a more general purpose way of logging things from sidecar containers.
    let debugLevel = process.env.DEBUG || '';
    if (debugLevel.includes(this.featureName) || debugLevel === '*') {
      let stream = await this.container.attach({stream: true, stdout: true, stderr: true});
      stream.pipe(process.stdout);
    }

    // TODO: In theory the output of the proxy might be useful consider logging
    // this somehow.
    await this.container.start({});

    var inspect = await this.container.inspect();
    var name = inspect.Name.slice(1);

    try {
      // wait for the initial server response...
      await waitForPort(inspect.NetworkSettings.IPAddress, '80', INIT_TIMEOUT);
    } catch (e) {
      throw new Error('Failed to initialize releng API proxy service due to: ' + e.name + ': ' + e.message);
    }

    return {
      links: [{name, alias: ALIAS}],
      env: {}
    };
  }

  async killed(task) {
    this.container.stop();
    task.runtime.gc.removeContainer(this.container.id);
  }
}

module.exports = RelengAPIProxy;
