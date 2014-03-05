var spawn = require('child_process').spawn;

/** Binary to launch inorder to get a worker instance running */
var BINARY = __dirname + '/../bin/worker';

/** Wrapper for a process with a local worker with given workerType */
var LocalWorker = function(workerType) {
  this.workerType = workerType;
  this.process    = null;
};

/** Launch the local worker instance as a subprocess */
LocalWorker.prototype.launch = function() {
  // Clone process environment variables
  var envs = {};
  for (var key in process.env) {
    envs[key] = process.env[key];
  }

  // Provide commandline arguments
  var args = [
    'start',
    '-i',   10000,        // We launch worker after task is submitted
    '-c',   1,
    '--provisioner-id',   'jonasfj-auto-test-prov',
    '--worker-type',      this.workerType,
    '--worker-group',     'jonasfj-local-worker',
    '--worker-id',        'who-ever-cares'
  ];

  // Launch worker process
  this.process = spawn(BINARY, args, {
    env:      envs,
    stdio:    'inherit'
  });

  // Listen for early exits, these are bad
  this.process.once('exit', this.onEarlyExit);
};

/** Handle early exits */
LocalWorker.prototype.onEarlyExit = function() {
  throw new Error("Local worker process exited early");
};

/** Terminate local worker instance */
LocalWorker.prototype.terminate = function() {
  if (this.process) {
    this.process.removeListener('exit', this.onEarlyExit);
    this.process.kill();
    this.process = null;
  }
};

// Export LocalWorker
module.exports = LocalWorker;
