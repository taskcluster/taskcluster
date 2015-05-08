var dockerOpts = require('dockerode-options');
var path = require('path');
var util = require('util');

var Promise = require('promise');
var Docker = require('dockerode-promise');
var DockerProc = require('dockerode-process');

function waitForMessage(listener, event, data) {
  return new Promise(function(accept) {
    listener.on(event, function filter(value) {
      if (value.toString().indexOf(data) !== -1) {
        listener.removeListener(event, filter);
        return accept();
      }
      process.stdout.write(value);
    });
  });
}

// Environment varibles to copy over to the docker instance.
var COPIED_ENV = [
  'DEBUG',
  'DOCKER_HOST',
  'AZURE_STORAGE_ACCOUNT',
  'AZURE_STORAGE_ACCESS_KEY',
  'TASKCLUSTER_CLIENT_ID',
  'TASKCLUSTER_ACCESS_TOKEN',
  'PULSE_USERNAME',
  'PULSE_PASSWORD'
];

function eventPromise(listener, event) {
  return new Promise(function(accept, reject) {
    listener.on(event, function(message) {
      accept(message);
    });
  });
}

export default class DockerWorker {
  constructor(provisionerId, workerType, workerId) {
    this.provisionerId = provisionerId;
    this.workerType = workerType;
    this.workerId = workerId;
    this.docker = new Docker(dockerOpts());
  }

  async launch() {
    // Path to babel in the docker container...
    var babel = '/worker/node_modules/.bin/babel-node';

    var createConfig = {
      name: this.workerId,
      Image: 'taskcluster/docker-worker-test:latest',
      Cmd: [
        '/bin/bash', '-c',
         [
          `${babel} /worker/bin/worker.js`,
          '--host test',
          '--worker-group', 'random-local-worker',
          '--worker-id', this.workerId,
          '--provisioner-id', this.provisionerId,
          '--worker-type', this.workerType,
          'test'
         ].join(' ')
      ],
      Env: [
        'DOCKER_CONTAINER_ID=' + this.workerId
      ],
      AttachStdin: false,
      AttachStdout: true,
      AttachStderr: true,
      Tty: true
    };

    // Copy enviornment variables over.
    COPIED_ENV.forEach(function(key) {
      if (!(key in process.env)) return;
      createConfig.Env.push(util.format('%s=%s', key, process.env[key]));
    });

    var startConfig = {
      Privileged: true,
      // Allow talking to other docker containers directly...
      NetworkMode: 'host',

      Binds: [
        util.format('%s:%s', path.resolve(__dirname, '..'), '/worker')
      ],
    };

    // If docker is supposed to connect over a socket set the socket as a bind
    // mount...
    var opts = dockerOpts();
    if (opts.socketPath) {
      startConfig.Binds.push(util.format(
        '%s:%s',
        opts.socketPath, '/var/run/docker.sock'
      ));
    }

    var proc = this.process = new DockerProc(this.docker, {
      create: createConfig,
      start: startConfig
    });

    proc.run();
    return proc;
  }

  async terminate() {
    if (this.process) {
      var proc = this.process;
      // Ensure the container is killed and removed.
      await proc.container.kill();
      await proc.container.remove();
      this.process = null;
    }
  }
}
