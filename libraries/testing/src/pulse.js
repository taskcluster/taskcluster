"use strict";

var childProcess  = require('child_process');
var Promise       = require('promise');
var debug         = require('debug')('taskcluster-lib-testing:pulse');
var taskcluster   = require('taskcluster-client');

/**
 * A utility for test written in mocha, that makes very easy to listen for a
 * specific message.
 *
 * credentials: {
 *   username:     '...',  // Pulse username
 *   password:     '...'   // Pulse password
 * }
 */
var PulseTestReceiver = function(credentials, mocha) {
  var that = this;
  this._connection        = new taskcluster.PulseConnection(credentials);
  this._listeners         = null;
  this._promisedMessages  = null;

  // **Note**, the before(), beforeEach(9, afterEach() and after() functions
  // below are mocha hooks. Ie. they are called by mocha, that is also the
  // reason that `PulseTestReceiver` only works in the context of a mocha test.
  if (!mocha) {
    mocha = require('mocha');
  }

  // Before all tests we ask the pulseConnection to connect, why not it offers
  // slightly better performance, and we want tests to run fast
  mocha.before(function() {
    return that._connection.connect();
  });

  // Before each test we create list of listeners and mapping from "name" to
  // promised messages
  mocha.beforeEach(function() {
    that._listeners         = [];
    that._promisedMessages  = {};
  });

  // After each test we clean-up all the listeners created
  mocha.afterEach(function() {
    // Because listener is created with a PulseConnection they only have an
    // AMQP channel each, and not a full TCP connection, hence, .close()
    // should be pretty fast too. Also unnecessary as they get clean-up when
    // the PulseConnection closes eventually... But it's nice to keep things
    // clean, errors are more likely to surface at the right test this way.
    return Promise.all(that._listeners.map(function(listener) {
      listener.close();
    })).then(function() {
      that._listeners         = null;
      that._promisedMessages  = null;
    });
  });

  // After all tests we close the PulseConnection, as we haven't named any of
  // the queues, they are all auto-delete queues and will be deleted if they
  // weren't cleaned up in `afterEach()`
  mocha.after(function() {
    return that._connection.close().then(function() {
      that._connection = null;
    });
  });
};


PulseTestReceiver.prototype.listenFor = function(name, binding) {
  // Check that the `name` haven't be used before in this test. Remember
  // that we reset this._promisedMessages beforeEach() test in mocha.
  if (this._promisedMessages[name] !== undefined) {
    throw new Error("name: '" + name + "' have already been used in this test");
  }

  // Create new listener using the existing PulseConnection, so no new TCP
  // connection is opened, it just creates an AMQP channel within the existing
  // TCP connection, this is much faster.
  var listener = new taskcluster.PulseListener({
    connection:     this._connection
  });

  // Add listener to list so we can cleanup later
  this._listeners.push(listener);

  // Create a promise that we got a message
  var gotMessage = new Promise(function(accept, reject) {
    listener.on('message', accept);
    listener.on('error', reject);
  });

  // Insert the promise gotMessage into this._promisedMessages for name, so
  // that we can return it when `.waitFor(name)` is called
  this._promisedMessages[name] = gotMessage;

  // Start listening
  return listener.bind(binding).then(function() {
    return listener.resume().then(function() {
      debug("Started listening for: %s", name);
    });
  });
};


PulseTestReceiver.prototype.waitFor = function(name) {
  // Check that the `name` have been used with listenFor in this test
  if (this._promisedMessages[name] === undefined) {
    throw new Error("listenFor has not been called with name: '" + name + "'" +
                    " in this test!");
  }
  // Otherwise we just return the promise
  return this._promisedMessages[name];
};

// Export PulseTestReceiver
module.exports = PulseTestReceiver;
