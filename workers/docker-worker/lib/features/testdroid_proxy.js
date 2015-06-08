import assert from 'assert';
import waitForPort from '../wait_for_port';
import { pullImageStreamTo } from '../pull_image_to_stream';
import request from 'superagent-promise';
import Debug from 'debug';

let debug = Debug('docker-worker:features:testdroid-proxy');

// Alias used to link the proxy.
const ALIAS = 'testdroid';
// Maximum time in MS to wait for socket to become available
const INIT_TIMEOUT = 5000;

const MISSING_DEVICE_CONFIGURATION = 'Device configuration must be supplied in task payload';
const MISSING_PHONE_CONFIGURATION = 'Phone device configuration must be supplied in task payload';

export default class TestdroidProxy {
  constructor() {
    /**
    Docker container used in the linking process.
    */
    this.container = null;
  }

  async link(task) {
    let config = task.task.payload.capabilities || {};
    assert(config.devices, MISSING_DEVICE_CONFIGURATION);
    assert(config.devices.phone, MISSING_PHONE_CONFIGURATION);

    let deviceCapabilities = config.devices.phone;

    let docker = task.runtime.docker;

    // Image name for the proxy container.
    let image = task.runtime.testdroidProxyImage;

    await pullImageStreamTo(docker, image, process.stdout);

    let cmd = [
        `--cloud-url=${task.runtime.testdroid.url}`,
        `--username=${task.runtime.testdroid.username}`,
        `--password=${task.runtime.testdroid.password}`,
        `--taskcluster-client-id=${task.runtime.taskcluster.clientId}`,
        `--taskcluster-access-token=${task.runtime.taskcluster.accessToken}`,
        `--device-timeout=${task.task.payload.maxRunTime}`
    ];

    let envs = [];
    if (process.env.DEBUG) {
      envs.push(`DEBUG=${process.env.DEBUG}`);
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
      let stream = await this.container.attach({stream: true, stdout: true, stderr: true});
      stream.pipe(process.stdout);
    }

    await this.container.start({});

    let inspect = await this.container.inspect();
    let host = inspect.NetworkSettings.IPAddress;
    let name = inspect.Name.slice(1)

    try {
      // wait for the initial server response...
      debug('waiting for port');
      await waitForPort(host, '80', INIT_TIMEOUT);
    } catch (e) {
      throw new Error('Failed to initialize testdroid proxy service.')
    }

    this.host = host;

    return {
      links: [{name, alias: ALIAS}],
      env: {
        // TODO this will change once sessions can be created outside of the test task
        DEVICE_CAPABILITIES: JSON.stringify(deviceCapabilities)
      }
    };
  }

  async killed(task) {
    // attempt to release the device in case task did not do so.  Calling release
    // is idempotent.
    let res = await request.post('http://'+this.host+'/device/release').end();
    task.runtime.gc.removeContainer(this.container.id);
  }
}
