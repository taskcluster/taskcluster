var Promise = require('promise');

var spawn = require('child_process').spawn;

/** Binary to launch inorder to get a worker instance running */
const BINARY = __dirname + '/../bin/worker.js';

function eventPromise(listener, event) {
  return new Promise(function(accept, reject) {
    listener.on(event, function(message) {
      accept(message);
    });
  });
}

/** Wrapper for a process with a local worker with given workerType */
export default class LocalWorker {
  constructor(provisionerId, workerType, workerId) {
    this.provisionerId = provisionerId;
    this.workerType = workerType;
    this.workerId = workerId;
    this.process = null;
  }

/** Launch the local worker instance as a subprocess */
  launch() {
    return new Promise(function(accept, reject) {
      // Clone process environment variables.
      var envs = {};
      for (var key in process.env) {
        envs[key] = process.env[key];
      }

      // We have special test only settings which require this env varialbe to be
      // set in the worker. (Such as sigterm waiting for clean shutdowns).
      envs.NODE_ENV = 'test';

      // Provide commandline arguments
      var args = [
        BINARY,
        '--host', 'test',
        '--provisioner-id', this.provisionerId,
        '--worker-type', this.workerType,
        '--worker-group', 'jonasfj-local-worker',
        '--worker-id', this.workerId,
        'test'
      ];

      // Launch worker process.
      var proc = this.process = spawn('babel-node', args, {
        execArgv: [],
        env: envs,
        stdio: 'pipe'
      });

      return accept(proc);
    }.bind(this));
  }

  /** Terminate local worker instance */
  async terminate() {
    if (this.process) {
      var proc = this.process;
      // Trigger a graceful halt (this waits for tasks to become idle, etc...).
      this.process.kill();
      this.process = null;
      await eventPromise(proc, 'exit');
    }
  }
}
