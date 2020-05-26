let devnull = require('dev-null');
let path = require('path');
let util = require('util');
let docker = require('../src/lib/docker')();
let dockerOpts = require('dockerode-options');
let DockerProc = require('dockerode-process');
let dockerUtils = require('dockerode-process/utils');
let pipe = require('promisepipe');
let Debug = require('debug');
let taskcluster = require('taskcluster-client');
const helper = require('./helper');

const debug = Debug('dockerworker');

const IMAGE = 'taskcluster/docker-worker-test:latest';

process.on('unhandledRejection', (reason, p) => {
  console.error(`Unhandled rejection at ${p}.\n${reason.stack || reason}`);
});

// Environment varibles to copy over to the docker instance.
let COPIED_ENV = [
  'DEBUG',
  'DOCKER_HOST',
];

class DockerWorker {
  constructor(provisionerId, workerType, workerId) {
    taskcluster.config(helper.optionsFromCiCreds());
    this.provisionerId = provisionerId;
    this.workerType = workerType;
    this.workerId = workerId;
  }

  async launch() {
    let stream = dockerUtils.pullImageIfMissing(docker, IMAGE);
    await pipe(stream, devnull());

    let createConfig = {
      name: this.workerId,
      Image: IMAGE,
      Cmd: [
        '/bin/bash', '-c',
        [
          // mount the securityfs in the container so that we can access apparmor
          'mount',
          '-tsecurityfs',
          'securityfs',
          '/sys/kernel/security',
          '&&',
          // the umask setting is for we to be able to write inside shared folders
          'umask',
          '0000',
          '&&',
          'node',
          global.asyncDump ? '--require /worker/src/lib/async-dump' : '',
          '/worker/src/bin/worker.js',
          '--host test',
          '--worker-group', 'random-local-worker',
          '--worker-id', this.workerId,
          '--provisioner-id', this.provisionerId,
          '--worker-type', this.workerType,
          'test',
        ].join(' '),
      ],
      Env: [
        'DOCKER_CONTAINER_ID=' + this.workerId,
      ],
      AttachStdin: false,
      AttachStdout: true,
      AttachStderr: true,
      Tty: true,
      Privileged: true,
      // Allow talking to other docker containers directly...
      NetworkMode: 'host',

      Binds: [
        util.format('%s:%s', path.resolve(__dirname, '..'), '/worker'),
        '/tmp:/tmp',
        '/etc/apparmor.d:/etc/apparmor.d',
      ],
    };

    // If docker is supposed to connect over a socket set the socket as a bind
    // mount...
    let opts = dockerOpts();
    if (opts.socketPath) {
      createConfig.Binds.push(util.format(
        '%s:%s',
        opts.socketPath, '/var/run/docker.sock',
      ));
    }

    const ciCreds = helper.secrets.get('ci-creds');
    createConfig.Env.push(`TASKCLUSTER_ROOT_URL=${ciCreds.rootUrl}`);
    createConfig.Env.push(`TASKCLUSTER_CLIENT_ID=${ciCreds.clientId}`);
    createConfig.Env.push(`TASKCLUSTER_ACCESS_TOKEN=${ciCreds.accessToken}`);

    // Copy enviornment variables over.
    COPIED_ENV.forEach(function(key) {
      if (!(key in process.env)) {return;}
      createConfig.Env.push(util.format('%s=%s', key, process.env[key]));
    });

    let proc = this.process = new DockerProc(docker, {
      create: createConfig,
      start: {},
    });

    proc.run();
    return proc;
  }

  async terminate() {
    if (this.process) {
      let proc = this.process;
      // Ensure the container is killed and removed.
      try {
        await proc.container.kill();
      } catch (e) {
        debug(e.message);
      }
      await proc.container.remove();
      this.process = null;
    }
  }
}

module.exports = DockerWorker;
