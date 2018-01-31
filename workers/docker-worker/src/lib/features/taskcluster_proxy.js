/**
This module handles the creation of the "taskcluster" proxy container which
allows tasks to talk directly to taskcluster services over a http proxy which
grants a particular permission level based on the task scopes.
*/
const waitForPort = require('../wait_for_port');
const http = require('http');

// Alias used to link the proxy.
const ALIAS = 'taskcluster';
// Maximum time in MS to wait for the proxy socket to become available.
// Default timeout for heroku is 30 seconds, so we should at least wait enough
// time for some retries to happen before giving up.
const INIT_TIMEOUT = 90000;

class TaskclusterProxy {
  constructor () {
    this.featureName = 'taskclusterProxy';
    /**
    Docker container used in the linking process.
    */
    this.container = null;
  }

  async link(task) {
    var docker = task.runtime.docker;

    // Image name for the proxy container.
    var image = task.runtime.taskclusterProxyImage;
    var imageId = await task.runtime.imageManager.ensureImage(image, process.stdout, task);

    var cmd = [
      '--client-id=' + task.claim.credentials.clientId,
      '--access-token=' + task.claim.credentials.accessToken
    ];
    // only pass in a certificate if one has been set
    if (task.claim.credentials.certificate) {
      cmd.push('--certificate=' + task.claim.credentials.certificate);
    }
    const cert = JSON.parse(task.claim.credentials.certificate);
    cmd.push(`--task-id=${task.status.taskId}`);
    cmd = cmd.concat(cert.scopes);

    // create the container.
    this.container = await docker.createContainer({
      Image: imageId,

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

    // XXX: Temporary work around to get errors from the container.  Replace this
    // with a more general purpose way of logging things from sidecar containers.
    let debugLevel = process.env.DEBUG || '';
    if (debugLevel.includes(this.featureName) || debugLevel === '*') {
      let stream = await this.container.attach({stream: true, stdout: true, stderr: true});
      stream.pipe(process.stdout);
    }

    await this.container.start({});

    var inspect = await this.container.inspect();
    var name = inspect.Name.slice(1);

    try {
      // wait for the initial server response...
      await waitForPort(inspect.NetworkSettings.IPAddress, '80', INIT_TIMEOUT);
    } catch (e) {
      throw new Error('Failed to initialize taskcluster proxy service.');
    }

    // Update credentials in proxy
    task.on('credentials', async (credentials) => {
      let creds = JSON.stringify(credentials);

      await new Promise((accept, reject) => {
        let req = http.request({
          hostname: inspect.NetworkSettings.IPAddress,
          method: 'PUT',
          path: '/credentials',
          headers: {
            'Content-Type': 'text/json',
            'Content-Length': creds.length
          }
        }, res => {
          if (res.statusCode === 200) {
            task.runtime.log('Credentials updated', {
              taskId: task.status.taskId,
              runId: task.runId,
              credentials: creds
            });
            accept();
          } else {
            let err = new Error(`Credentials update failed ${res.statusCode}`);
            task.runtime.log(err, {
              taskId: task.status.taskId,
              runId: task.runId
            });
            reject(err);
          }
        });

        req.on('error', err => reject(err));
        req.write(creds);
        req.end();
      });
    });

    return {
      links: [{name, alias: ALIAS}],
      env: {}
    };
  }

  async killed(task) {
    task.runtime.gc.removeContainer(this.container.id);
  }
}

module.exports = TaskclusterProxy;
