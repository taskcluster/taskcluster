var fork    = require('child_process').fork;
var path    = require('path');
var _       = require('lodash');
var Promise = require('promise');
var debug   = require('debug')('LocalQueue');

/** Wrapper for a process with a local queue, useful for testing */
var LocalQueue = function() {
  this.process    = null;
};

/** Launch the local queue instance as a subprocess */
LocalQueue.prototype.launch = function() {
  var that = this;
  return new Promise(function(accept, reject) {
    // Arguments for node.js
    var args = [
      '--database:dropTables'
    ];

    // Launch queue process
    that.process = fork('server.js', args, {
      env:      _.cloneDeep(process.env),
      silent:   false,
      cwd:      path.join(__dirname, '../')
    });

    // Reject on exit
    that.process.once('exit', reject);

    // Message handler
    var messageHandler = function(message) {
      if (message.ready == true) {
        // Stop listening messages
        that.process.removeListener('message', messageHandler);

        // Stop listening for rejection
        that.process.removeListener('exit', reject);

        // Listen for early exits, these are bad
        that.process.once('exit', that.onEarlyExit);

        // Accept that the server started correctly
        debug("----------- LocalQueue Running --------------");
        accept();
      }
    };

    // Listen for the started message
    that.process.on('message', messageHandler);
  });
};

/** Handle early exits */
LocalQueue.prototype.onEarlyExit = function() {
  debug("----------- LocalQueue Crashed --------------");
  throw new Error("Local queue process exited early");
};

/** Terminate local queue instance */
LocalQueue.prototype.terminate = function() {
  debug("----------- LocalQueue Terminated -----------");
  if (this.process) {
    this.process.removeListener('exit', this.onEarlyExit);
    this.process.kill();
    this.process = null;
  }
};

// Export LocalQueue
module.exports = LocalQueue;
