import waitForPort from '../wait_for_port';
import { pullImageStreamTo } from '../pull_image_to_stream';
import request from 'superagent-promise';
import Debug from 'debug';

let debug = Debug('docker-worker:features:testdroid-proxy');

// Alias used to link the proxy.
const ALIAS = 'testdroid';
// Maximum time in MS to wait for socket to become available
const INIT_TIMEOUT = 5000;

export default class TestdroidProxy {
  constructor() {
    /**
    Docker container used in the linking process.
    */
    this.container = null;
  }

  async link(task) {
    var docker = task.runtime.docker;

    // Image name for the proxy container.
    var image = task.runtime.testdroidProxyImage;

    await pullImageStreamTo(docker, image, process.stdout);

    var cmd = [
        `--cloud-url=${task.runtime.testdroid.url}`,
        `--username=${task.runtime.testdroid.username}`,
        `--password=${task.runtime.testdroid.password}`,
        `--taskcluster-client-id=${task.runtime.taskcluster.clientId}`,
        `--taskcluster-access-token=${task.runtime.taskcluster.accessToken}`
    ];

    var envs = [];
    if (process.env.DEBUG) {
      envs.push('DEBUG=' + process.env.DEBUG);
    }

    // create the container.
    this.container = await docker.createContainer({
      Image: image,
      Env: envs,
      Tty: true,
      AttachStdin: false,
      AttachStdout: true,
      AttachStderr: true,

      Cmd: cmd
    });

    this.container = docker.getContainer(this.container.id);

    if (process.env.DEBUG) {
      var stream = await this.container.attach({stream: true, stdout: true, stderr: true});
      stream.pipe(process.stdout);
    }

    await this.container.start({});

    var inspect = await this.container.inspect();
    var host = inspect.NetworkSettings.IPAddress;
    var name = inspect.Name.slice(1)

    try {
      // wait for the initial server response...
      debug('waiting for port');
      await waitForPort(host, '80', INIT_TIMEOUT);
    } catch (e) {
      throw new Error('Failed to initialize testdroid proxy service.')
    }

    this.host = host;
    return [{ name: name, alias: ALIAS }];
  }

  async killed(task) {
    debug('in testdroid proxy');
    // attempt to release the device in case task did not do so.  Calling release
    // is idempotent.
    var res = await request.post('http://'+this.host+'/device/release').end();
    task.runtime.gc.removeContainer(this.container.id);
  }
}
