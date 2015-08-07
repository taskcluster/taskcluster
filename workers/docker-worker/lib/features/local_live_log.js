/**
This module handles the creation of the "taskcluster" proxy container which
allows tasks to talk directly to taskcluster services over a http proxy which
grants a particular permission level based on the task scopes.
*/

import Debug from 'debug';
import http from 'http';
import Promise from 'promise';
import slugid from 'slugid';
import URL from 'url';

import BulkLog from './bulk_log';
import { pullImageStreamTo } from '../pull_image_to_stream';
import waitForPort from '../wait_for_port';

const ARTIFACT_NAME = 'public/logs/live.log';
const BACKING_ARTIFACT_NAME = 'public/logs/live_backing.log';
// Maximum time to wait for the put socket to become available.
const INIT_TIMEOUT = 2000;

let debug = Debug('taskcluster-docker-worker:features:local_live_log');

// Alias used to link the proxy.
export default class TaskclusterLogs {
  constructor() {
    /**
    Docker container used in the linking process.
    */
    this.container = null;
    this.token = slugid.v4();
  }

  async link(task) {
    debug('create live log container...')
    // ensure we have a bulk log backing stuff...
    this.bulkLog = new BulkLog(BACKING_ARTIFACT_NAME);
    await this.bulkLog.created(task);

    let docker = task.runtime.docker;

    // Image name for the proxy container.
    let image = task.runtime.taskclusterLogImage;

    await pullImageStreamTo(docker, image, process.stdout);

    let envs = [];
    if (process.env.DEBUG) {
      envs.push('DEBUG=' + process.env.DEBUG);
    }

    // create the container.
    let createConfig = {
      Image: image,
      Tty: false,
      Env: [
        "DEBUG=*",
        `ACCESS_TOKEN=${this.token}`
      ],
      //Env: envs,
      AttachStdin: false,
      AttachStdout: true,
      AttachStderr: true,
      ExposedPorts: {
        '60023/tcp': {}
      },
      HostConfig: {}
    };

    if (task.runtime.logging.secureLiveLogging) {
      createConfig.Env.push('SERVER_CRT_FILE=/etc/sslcert.crt')
      createConfig.Env.push('SERVER_KEY_FILE=/etc/sslkey.key')
      createConfig.HostConfig.Binds = [
        `${task.runtime.ssl.certificate}:/etc/sslcert.crt:ro`,
        `${task.runtime.ssl.key}:/etc/sslkey.key:ro`
      ]
    }

    this.container = await docker.createContainer(createConfig);

    // Terrible hack to get container promise proxy.
    this.container = docker.getContainer(this.container.id);

    // TODO: In theory the output of the proxy might be useful consider logging
    // this somehow.
    await this.container.start({
      // bind the reading side to the host so we can expose it to the world...
      PortBindings: {
        "60023/tcp": [{ HostPort: "0" }]
      }
    });
    let inspect = await this.container.inspect();

    try {
      // wait for the initial server response...
      await waitForPort(
        inspect.NetworkSettings.IPAddress, '60022', INIT_TIMEOUT
      );
    } catch (e) {
      task.runtime.log('Failed to connect to live log server', {
        taskId: task.status.taskId,
        runId: task.runId
      });
      // The killed method below will handle cleanup of resources...
      return
    }
    // Log PUT url is only available on the host itself
    let putUrl = `http:\/\/${inspect.NetworkSettings.IPAddress}:60022/log`;
    let opts = URL.parse(putUrl);
    opts.method = 'put';

    this.stream = http.request(opts);

    // Note here that even if the live logging server or upload fails we don't
    // care too much since the backing log should always work... So we basically
    // want to handle errors just enough so we don't accidentally fall over as
    // we switch to the backing log.
    this.stream.on('error', function(err) {
      task.runtime.log('Error piping data to live log', {
        err: err.toString(),
        taskId: task.status.taskId,
        runId: task.runId
      });
      task.stream.unpipe(this.stream);
    }.bind(this));
    task.stream.pipe(this.stream);

    let publicPort = inspect.NetworkSettings.Ports['60023/tcp'][0].HostPort;
    this.publicUrl = URL.format({
      protocol: task.runtime.logging.secureLiveLogging ? 'https' : 'http',
      hostname: task.hostname,
      port: publicPort,
      pathname: `log/${this.token}`
    })
    debug('live log running: putUrl', putUrl)
    debug('live log running: publicUrl', this.publicUrl);

    let queue = task.runtime.queue;

    // Intentionally used the same expiration as the bulkLog
    let expiration = new Date(
      Math.min(Date.now() + task.runtime.logging.bulkLogExpires,
      new Date(task.task.expires)));


    // Create the redirect artifact...
    await queue.createArtifact(
      task.status.taskId,
      task.runId,
      ARTIFACT_NAME,
      {
        storageType: 'reference',
        expires: expiration,
        contentType: 'text/plain',
        url: this.publicUrl
      }
    );

    return {
      links: [],
      env: {}
    };
  }

  async killed(task) {
    debug('switching live log redirect to backing log...')
    // Can't create artifacts for a task that's been canceled
    if (task.isCanceled()) {
      // Cleanup all references to the live logging server...
      task.runtime.gc.removeContainer(this.container.id);
      return;
    }

    // Note here we don't wait or care for the live logging to complete
    // correctly we simply let it pass/fail to finish since we are going to kill
    // the connection anyway...

    let backingUrl = await this.bulkLog.killed(task);

    // Switch references to the new log file on s3 rather then the local worker
    // server...
    let expiration = new Date(
      Math.min(Date.now() + task.runtime.logging.bulkLogExpires,
      new Date(task.task.expires)));

    await task.runtime.queue.createArtifact(
      task.status.taskId,
      task.runId,
      ARTIFACT_NAME,
      {
        storageType: 'reference',
        expires: expiration,
        contentType: 'text/plain',
        url: backingUrl
      }
    );

    // Cleanup all references to the live logging server...
    task.runtime.gc.removeContainer(this.container.id);
  }
}
