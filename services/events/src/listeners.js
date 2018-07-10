var assert      = require('assert');
var taskcluster = require('taskcluster-client');
var debug       = require('debug')('events:listeners');
var _           = require('lodash');

/**
 * Create Listener and Handle Events
 *
 * options:
 * {
 *   credentials:        // Pulse credentials
 * }
 */
class Listeners {
  constructor(options) {
    assert(options.credentials, 'Pulse credentials must be provided');
    
    this.credentials = options.credentials;
    this.connection = null;
    this.listeners = null;
  }

  /** Setup the PulseConnection */
  setup() {
    debug('Setting up Listeners');
    assert(this.listeners === null, 'Cannot setup twice');

    this.connection = new taskcluster.PulseConnection(this.credentials);
    this.listeners = [];
  }

  /** Create a new PulseListener instance and add it to this.listeners */
  async createListener(bindings) {
    let listener;
    try {
      listener = new taskcluster.PulseListener({
        prefetch:   5,
        connection: this.connection,
        maxLength:  50,
      });

      _.forEach(bindings, binding => listener.bind({
        exchange:          binding.exchange,
        routingKeyPattern: binding.routingKeyPattern,  
      }));

      this.listeners.push(listener);
      await listener.resume();

      return listener;
    } catch (err) {
      err.code = 404;
      debug(err);
      this.closeListener(listener);
      throw err;
    }
  }

  /** Close and remove listener from this.listeners */
  closeListener(listener) {
    let removeIndex = this.listeners.findIndex(({_queueName}) => listener._queueName === _queueName);
    if (removeIndex > -1) {
      listener.close();
      this.listeners.splice(removeIndex, 1);
    }
  }

  async terminate() {
    debug('Terminating Listeners..');
    if (this.listeners) {
      _.forEach(this.listeners, listener => this.closeListener(listener));
    }
    this.listeners = undefined;
  }
}

module.exports = Listeners;
