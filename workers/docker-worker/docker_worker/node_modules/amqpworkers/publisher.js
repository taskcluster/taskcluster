var Promise = require('promise'),
    EventEmitter = require('events').EventEmitter;

function publishPending(exchange, route, message) {
  var channelPromise = this.openChannel();

  // individual promise for each pending publish
  return new Promise(function(accept, reject) {
    channelPromise.then(
      // wait for the channel open
      function () {
        return publishReady.call(
          this,
          exchange,
          route,
          message
        );
      }.bind(this)
    ).then(
      accept,
      reject
    );
  }.bind(this));
}

function publishReady(exchange, route, message) {
  return this.channel.publish(
    exchange,
    route,
    message.buffer,
    message.options
  );
}

function Publisher(connection) {
  this.connection = connection;

  EventEmitter.call(this);

  this._boundEmitError = this.emit.bind(this, 'error');
  this._boundEmitClose = this.emit.bind(this, 'close');
}

Publisher.prototype = {
  __proto__: EventEmitter.prototype,

  channel: null,
  connection: null,

  bindChannel: function(channel) {
    channel.on('error', this._boundEmitError);
    channel.on('close', this._boundEmitClose);
  },

  unbindChannel: function(channel) {
    channel.removeListener('error', this._boundEmitError);
    channel.removeListener('close', this._boundEmitClose);
  },

  /**
  Begin opening the channel for publishing.

  @private
  @return {Promise} will return the same promise every time.
  */
  openChannel: function() {
    if (this.channel) throw new Error('.channel is already open');
    if (this.channelPromise) return this.channelPromise;

    this.channelPromise = this.connection.createConfirmChannel();

    return this.channelPromise.then(
      function(channel) {
        // after the channel is open the first step is to remove the promise
        this.channelPromise = null;

        // then we need to switch publish to publishReady. Previous calls to
        // publish pending will be handled in their scope.
        this.publish = publishReady;

        // now we are ready to publish stuff on the channel!
        this.channel = channel;

        // setup event proxying
        this.bindChannel(channel);
      }.bind(this)
    );
  },

  publish: publishPending,

  close: function() {
    if (!this.channel) return Promise.from(null);
    return this.channel.close().then(
      function() {
        // get rid of all channel associations
        this.unbindChannel(this.channel);
        this.channel = null;
      }.bind(this)
    );
  }
};

module.exports = Publisher;
