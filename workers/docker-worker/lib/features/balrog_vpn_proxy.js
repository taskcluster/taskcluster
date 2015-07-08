import assert from 'assert';
import Debug from 'debug';
import { pullDockerImage } from '../pull_image_to_stream';
import { scopeMatch } from 'taskcluster-base/utils';
import request from 'superagent-promise';
import waitForPort from '../wait_for_port';

let debug = Debug('taskcluster-docker-worker:features:balrogVPNProxy');

// Prefix used in scope matching for docker-worker features
const FEATURE_SCOPE_PREFIX = 'docker-worker:feature:';

// Prefix used in scope matching for authenticated docker images.
const IMAGE_SCOPE_PREFIX = 'docker-worker:image:';

// Alias used to link the proxy.
const ALIAS = 'balrog';

// Maximum time to wait for the put socket to become available.
const INIT_TIMEOUT = 2000;

// Address for Balrog update server
const PROXY_ADDR = "https://aus4-admin.mozilla.org";

// Delay in between retries for vpn to be connected
const RETRY_DELAY = 1000;

// Maximum number of times to attempt connecting to balrog server
const MAX_RETRIES = 15;

async function sleep(duration) {
  return new Promise(accept => setTimeout(accept, duration));
}

export default class BalrogVPNProxy {
  constructor () {
    this.featureName = 'balrogVPNProxy';
    /**
    Docker container used in the linking process.
    */
    this.container = null;
  }

  async link(task) {
    let featureScope = FEATURE_SCOPE_PREFIX + this.featureName;
    if (!scopeMatch(task.task.scopes, featureScope)) {
      throw new Error(
        `Insufficient scopes to use '${this.featureName}' feature.  ` +
        `Try adding ${featureScope} to the .scopes array.`
      );
    }

    let docker = task.runtime.docker;
    // Image name for the proxy container.
    let image = task.runtime.balrogVPNProxyImage;

    // If feature is granted by scope match, grant image scope used for
    // pulling docker image.  Users are generally unaware of the images and tags
    // used for docker-worker features ahead of time, but they do know what
    // feature they are using.
    let imageScopes = [`${IMAGE_SCOPE_PREFIX+image}`];

    await pullDockerImage(
      task.runtime,
      image,
      imageScopes,
      task.taskId,
      task.runId,
      process.stdout
    );

    // create the container.
    this.container = await docker.createContainer({
      Image: image,
      Env: [`PROXIED_SERVER=${PROXY_ADDR}`],
      Tty: true,
      AttachStdin: false,
      AttachStdout: true,
      AttachStderr: true,
      HostConfig: {
        // Needed for creating tun device and manipulating routing tables
        CapAdd: ["NET_ADMIN"],
        ExtraHosts: [
          // XXX: hack for now.  Problem in taskcluster-vpn-proxy where resolv.conf
          // isn't updated when vpn'ed in so name resolution does not work.
          "aus4-admin.mozilla.org:10.8.81.74"
        ]
      }
    });

    // Terrible hack to get container promise proxy.
    this.container = docker.getContainer(this.container.id);

    await this.container.start({});

    let inspect = await this.container.inspect();
    let name = inspect.Name.slice(1);
    let ipAddress = inspect.NetworkSettings.IPAddress;

    // Wait for web server to be reachable before ensuring vpn connected and balrog
    // server is reachable.
    try {
      // wait for the initial server response...
      await waitForPort(inspect.NetworkSettings.IPAddress, '80', INIT_TIMEOUT);
    } catch (e) {
      throw new Error('Failed to initialize balrog vpn proxy service.');
    }

    let retries = MAX_RETRIES;
    while (retries-- > 0) {
      try {
        let response = await request.get(`http:\/\/${ipAddress}`).end();
        throw new Error(
          'Could not connect to balrog server and receive expected response ' +
          `Status code: ${response.status}`);
      } catch (e) {
        // Balrog server requires authentication and will return 401 when
        // reachable but unauthenticated.
        if (e.message === 'Unauthorized') {
          break;
        }
        if (retries === 0) {
          debug(e);
          throw e;
        }
        debug(`Could not connect to vpn proxy.  Retries left: ${retries}`);
        await sleep(RETRY_DELAY);
      }
    }

    return {
      links: [{name, alias: ALIAS}],
      env: {}
    };
  }

  async killed(task) {
    // Attempt to gracefully stop the container prior to the GC forcefully
    // removing it.  Also, this will ensure the vpn connection is closed
    // as soon as possible.
    this.container.stop();
    task.runtime.gc.removeContainer(this.container.id);
  }
}
