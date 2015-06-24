/**
This module handles the creation of the "relengapi" proxy container which
allows tasks to talk directly to releng api over a http proxy which
grants a particular permission level based on the task scopes.
*/
import waitForPort from '../wait_for_port';
import { pullImageStreamTo } from '../pull_image_to_stream';

// Alias used to link the proxy.
const ALIAS = 'relengapi';

// Maximum time in MS to wait for the proxy socket to become available.
const INIT_TIMEOUT = 2000;

export default class RelengAPIProxy {
  constructor () {
    /**
    Docker container used in the linking process.
    */
    this.container = null;
  }

  async link(task) {
    var docker = task.runtime.docker;

    // Image name for the proxy container.
    var image = task.runtime.features.relengAPIProxy.image;

    await pullImageStreamTo(docker, image, process.stdout);

    var cmd = [
        `--relengapi-token=${task.runtime.features.relengAPIProxy.token}`,
        task.status.taskId
    ];

    // create the container.
    this.container = await docker.createContainer({
      Image: image,

      Tty: true,
      AttachStdin: false,
      AttachStdout: true,
      AttachStderr: true,

      Cmd: cmd
    });

    // Terrible hack to get container promise proxy.
    this.container = docker.getContainer(this.container.id);

    // TODO: In theory the output of the proxy might be useful consider logging
    // this somehow.
    await this.container.start({});

    var inspect = await this.container.inspect();
    var name = inspect.Name.slice(1);

    try {
      // wait for the initial server response...
      await waitForPort(inspect.NetworkSettings.IPAddress, '80', INIT_TIMEOUT);
    } catch (e) {
      throw new Error('Failed to initialize releng API proxy service.');
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
