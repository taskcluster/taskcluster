/**
This module handles the creation of the "taskcluster" proxy container which
allows tasks to talk directly to taskcluster services over a http proxy which
grants a particular permission level based on the task scopes.
*/
import waitForPort from '../wait_for_port';
import { pullImageStreamTo } from '../pull_image_to_stream';

// Alias used to link the proxy.
const ALIAS = 'taskcluster';
// Maximum time in MS to wait for the proxy socket to become available.
const INIT_TIMEOUT = 2000;

export default class TaskclusterProxy {
  constructor () {
    /**
    Docker container used in the linking process.
    */
    this.container = null;
  }

  async link(task) {
    var docker = task.runtime.docker;

    // Image name for the proxy container.
    var image = task.runtime.taskclusterProxyImage;

    await pullImageStreamTo(docker, image, process.stdout);

    var assumedScope = 'assume:worker-id:' + task.runtime.workerGroup +
                       '/' + task.runtime.workerId;

    var cmd = [
        '--client-id=' + task.runtime.taskcluster.clientId,
        '--access-token=' + task.runtime.taskcluster.accessToken,
        task.status.taskId,
        assumedScope
    ];

    // create the container.
    this.container = await docker.createContainer({
      Image: image,

      Tty: true,
      AttachStdin: false,
      AttachStdout: true,
      AttachStderr: true,

      // The proxy image uses a delegating authentication pattern it accepts
      // the primary workers authentication details and a task id (which is used
      // to fetch the task and it's scopes to delegate). Note: passing the
      // arguments via 'Cmd' may potentially be a security issue. Alternatives
      // are: 1. Volume mounted files, 2. Docker secret (not landed yet).
      Cmd: cmd
    });

    // Terrible hack to get container promise proxy.
    this.container = docker.getContainer(this.container.id);

    // TODO: In theory the output of the proxy might be useful consider logging
    // this somehow.
    await this.container.start({});

    var inspect = await this.container.inspect();
    var name = inspect.Name.slice(1)

    try {
      // wait for the initial server response...
      await waitForPort(inspect.NetworkSettings.IPAddress, '80', INIT_TIMEOUT);
    } catch (e) {
      throw new Error('Failed to initialize taskcluster proxy service.')
    }

    return {
      links: [{name, alias: ALIAS}],
      env: {}
    };
  }

  async killed(task) {
    task.runtime.gc.removeContainer(this.container.id);
  }
}
