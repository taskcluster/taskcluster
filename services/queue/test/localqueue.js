var fork    = require('child_process').fork;
var path    = require('path');
var Promise = require('promise');
var testDb  = require('./db');
var debug   = require('debug')('LocalQueue');

/** Wrapper for a process with a local queue, useful for testing */
var LocalQueue = function() {
  this.process    = null;
};

/** Launch the local queue instance as a subprocess */
LocalQueue.prototype.launch = function() {

  // recreate the db
  return testDb().then(function() {
    return new Promise(function(accept, reject) {
      // Arguments for node.js
      var args = [
        '--config',
        'test',
        'server'
      ];

      var proc = this.process = fork(
        './bin/queue',
        args,
        {
          env: process.env,
          silent: false,
          cwd: __dirname + '/../'
        }
      );

      // Reject on exit
      proc.once('exit', reject);

      // Message handler
      var messageHandler = function(message) {
        if (!message.ready) return;

        // Stop listening messages
        proc.removeListener('message', messageHandler);

        // Stop listening for rejection
        proc.removeListener('exit', reject);

        // Listen for early exits, these are bad
        proc.once('exit', this.onEarlyExit);

        // Accept that the server started correctly
        debug("----------- LocalQueue Running --------------");
        accept();
      }.bind(this);

      // Listen for the started message
      proc.on('message', messageHandler);
    }.bind(this));
  }.bind(this));
};

/** Handle early exits */
LocalQueue.prototype.onEarlyExit = function() {
  debug("----------- LocalQueue Crashed --------------");
  throw new Error("Local queue process exited early");
};

/** Terminate local queue instance */
LocalQueue.prototype.terminate = function() {
  debug("----------- LocalQueue Terminated -----------");
  if (!this.process) return Promise.from(null);


  return new Promise(function(accept) {
    var proc = this.process;
    this.process.removeListener('exit', this.onEarlyExit);
    this.process.kill();
    this.process = null;

    proc.once('exit', accept);
  }.bind(this));
};

// Export LocalQueue
module.exports = LocalQueue;
