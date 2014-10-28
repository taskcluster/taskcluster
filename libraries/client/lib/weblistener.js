var events    = require('events');
var util      = require('util');
var Promise   = require('promise');
var debug     = require('debug')('taskcluster-client:weblistener');
var _         = require('lodash');
var assert    = require('assert');
var urljoin   = require('url-join');
var slugid    = require('slugid');

// Ready states
var readyState = {
  CONNECTING:   0,
  OPEN:         1,
  CLOSING:      2,
  CLOSED:       4
};

/**
 * Create new WebListener
 *
 * options: {
 *   baseUrl:      undefined // defaults to: https://events.taskcluster.net/v1
 * }
 */
var WebListener = function(options) {
  // Check that a SockJS client was provided
  if (WebListener.SockJS === null) {
    console.log("You must provide a SockJS implementation for WebListener!");
    throw new Error("SockJS implementation not provided");
  }

  // Provide default options
  this.options = _.defaults({}, options, {
    baseUrl:      'https://events.taskcluster.net/v1'
  });

  // Hold list of bindings and promises that is waiting to be resolved
  this._bindings = [];
  this._pendingPromises = [];
};

// Inherit from events.EventEmitter
util.inherits(WebListener, events.EventEmitter);

// Export WebListener
exports.WebListener = WebListener;

/** Connect and bind all declared bindings */
WebListener.prototype.connect = function() {
  var that = this;

  // Open websocket
  var socketUrl = urljoin(this.options.baseUrl, 'listen');
  this.socket   = new WebListener.SockJS(socketUrl);


  // Wait for websocket to opened
  var opened = new Promise(function(accept, reject) {
    // Add event handlers for open, close and error
    that.socket.addEventListener('open', function() {
      // Remove event handler for error and close
      that.socket.removeEventListener('error', reject);
      that.socket.removeEventListener('close', reject);
      accept();
    });
    that.socket.addEventListener('error',   reject);
    that.socket.addEventListener('close',   reject);
  });

  /// Add handlers for messages, errors and closure
  this.socket.addEventListener('message', this.onMessage.bind(this));
  this.socket.addEventListener('error',   this.onError.bind(this));
  this.socket.addEventListener('close',   this.onClose.bind(this));

  // Bind to all registered bindings
  var bound = opened.then(function() {
    return Promise.all(that._bindings.map(function(binding) {
      return that._send('bind', binding);
    }));
  });

  // Create a promise that is resolved once we get a 'ready' message
  var isReady = new Promise(function(accept, reject) {
    var ready_accept, ready_reject;
    ready_accept = function() {
      that.removeListener('ready', ready_accept);
      that.removeListener('error', ready_reject);
      that.removeListener('close', ready_reject);
      accept();
    }
    ready_reject = function(err) {
      that.removeListener('ready', ready_accept);
      that.removeListener('error', ready_reject);
      that.removeListener('close', ready_reject);
      reject(err);
    }
    that.on('ready', ready_accept);
    that.on('error', ready_reject);
    that.on('close', ready_reject);
  });

  // When all bindings have been bound, we're just waiting for 'ready'
  return bound.then(function() {
    return isReady;
  });
};

/** Send raw message over socket */
WebListener.prototype._send = function(method, options) {
  var that = this;
  // Send message, if socket is open
  if (this.socket && this.socket.readyState === readyState.OPEN) {
    return new Promise(function(accept, reject) {
      // Create request id
      var requestId = slugid.v4();

      // Push pending promise
      that._pendingPromises.push({
        id:     requestId,
        accept: accept,
        reject: reject
      });

      // Send message
      that.socket.send(JSON.stringify({
        method:   method,
        id:       requestId,
        options:  options
      }));
    });
  } else {
    throw new Error("Can't send message if socket isn't OPEN");
  }
};

/** Handle message from websocket */
WebListener.prototype.onMessage = function(e) {
  // Attempt to parse the message
  try {
    var message = JSON.parse(e.data);
  }
  catch(err) {
    debug("Failed to parse message from server: %s, error: %s", e.data, err);
    return this.emit('error', err);
  }

  // Check that id is a string
  if (typeof(message.id) !== 'string') {
    debug("message: %j has no string id!", message);
    return this.emit('error', new Error("Message has no id"));
  }

  // Handle replies to pending promises
  var promises = _.remove(this._pendingPromises, function(promise) {
    return promise.id === message.id;
  });
  if (promises.length > 0) {
    // if this is an error, we don't emit the error event, but reject the
    // promise
    if (message.event === 'error') {
      return promises.forEach(function(promise) {
        promise.reject(message.payload);
      });
    }
    // If it's not an error we resolve the promises and emit whatever event is
    // was provided
    promises.forEach(function(promise) {
      promise.accept(message.payload);
    });
  }

  // Handle ready events
  if (message.event === 'ready') {
    return this.emit('ready');
  }

  // Handle bound events
  if (message.event === 'bound') {
    return this.emit('bound', message.payload);
  }

  // Handle message events
  if (message.event === 'message') {
    return this.emit('message', message.payload);
  }

  // Handle error events
  if (message.event === 'error') {
    return this.emit('error', message.payload);
  }

  debug("message: %j is of unknown event type: %s", message, message.event);
  return this.emit('error', new Error("Unknown event type from server"));
};

/** Handle websocket error */
WebListener.prototype.onError = function() {
  debug("WebSocket error");
  this.emit('error', new Error("WebSocket Error"));
};

/** Handle closure of websocket */
WebListener.prototype.onClose = function() {
  this.emit('close');
};

/** Bind to an exchange */
WebListener.prototype.bind = function(binding) {
  var that = this;

  // Store the binding so we can connect, if not already there
  this._bindings.push(binding);

  // If already open send the bind request
  if (this.socket && this.socket.readyState === readyState.OPEN) {
    return this._send('bind', binding);
  }
  return Promise.resolve(undefined);
};

/** Close connection and stop listening */
WebListener.prototype.close = function() {
  var that = this;
  // Close connection of not already closed
  if (this.socket && this.socket.readyState !== readyState.CLOSED) {
    var closed = new Promise(function(accept) {
      that.once('close', accept);
    });
    this.socket.close();
    return closed;
  }
  return Promise.resolve(undefined);
};

/**
 * Start listening,
 *
 * Just calls connect(), added for compatibility with AMQPListener.
 */
WebListener.prototype.resume = function() {
  return this.connect();
};

/**
 * Stop listening,
 *
 * Just calls close(), added for compatibility with AMQPListener.
 */
WebListener.prototype.pause = function() {
  return this.close();
};


/**
 * The location that loads this module needs to provide a sock.js module.
 * Otherwise, we can't use the listener in both node.js and web-browser.
 */
WebListener.SockJS = null;
