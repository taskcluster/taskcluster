var JSONMime = 'application/json';

var EventEmitter = require('events').EventEmitter,
    Promise = require('promise');


var debug = require('debug')('amqpworker:consume');

function binaryJSON(buffer) {
  return JSON.parse(buffer.toString('utf8'));
}

function channelOptions(channel, options) {
  // no-op
  if (!options || !options.prefetch) return Promise.from(null);
  debug('prefetch', options.prefetch);
  return channel.prefetch(options.prefetch);
}

function Consumer(connection, reader) {
  // optionally passed reader
  if (reader) this.read = reader;

  this.connection = connection;
  EventEmitter.call(this);

  // bound single instance methods
  this._boundEmitError = this.emit.bind(this, 'error');
  this._boundEmitClose = this.emit.bind(this, 'close');
}

Consumer.prototype = {
  __proto__: EventEmitter.prototype,

  constructor: Consumer,

  channel: null,

  connection: null,

  read: function(content, message) {
    return new Promise(function() {
      console.error('amqp/consumer .read method not overriden');
      throw new Error('.read must be overriden.');
    });
  },

  /**
  Default message parsing
  @protected
  */
  parseMessage: function(message) {
    if (message.properties.contentType !== JSONMime) {
      debug('cannot parse', message.properties.contentType);
      return message.content;
    }

    return binaryJSON(message.content);
  },

  /**
  @type Boolean true when consuming a queue and false otherwise.
  */
  consuming: false,

  /**
  AMQP consumer tag... Generally only useful for canceling consumption.
  */
  consumerTag: null,

  /**
  Handle binding channel events to consumer events.
  @private
  */
  bindChannel: function(channel) {
    channel.on('close', this._boundEmitClose);
    channel.on('error', this._boundEmitError);
  },

  /**
  Handle unbinding channel events to consumer events.
  @private
  */
  unbindChannel: function(channel) {
    channel.removeListener('close', this._boundEmitClose);
    channel.removeListener('error', this._boundEmitError);
  },

  /**
  Begin consuming queue.

  @param {String} queue name of the queue to consume from.
  @param {Object} [options]
  @param {Number} [options.prefetch] maximum concurrency of reads.
  @return Promise
  */
  consume: function(queue, options) {
    if (this.consuming) throw new Error('already consuming queue');
    debug('consume', queue);

    // initiate the consuming process
    this.consuming = true;

    return new Promise(function(accept, reject) {
      this.connection.createChannel().then(

        // assign the channel for later
        function (channel) {
          this.channel = channel;
          this.bindChannel(channel);
        }.bind(this)

      ).then(

        // handle options
        function() {
          return channelOptions(this.channel, options);
        }.bind(this)

      ).then(

        // begin the consume
        function() {
          return this.channel.consume(
            queue, 
            this.handleConsume.bind(this)
          );
        }.bind(this)

      ).then(

        // save the consumer tag so we can cancel consumes
        function(consumeResult) {
          this.consumerTag = consumeResult.consumerTag;     
        }.bind(this)

      ).then(
        accept,
        reject
      );

    }.bind(this));
  },

  /**
  Handle the "raw" consume notification and transform it into a promise for ack/nack.

  @private
  */
  handleConsume: function(message) {
    if (!message) {
      return debug('no-op message', message);
    }

    // there is a race where handleConsume is fired prior to assigning
    // the consumerTag so we handle that case here as well...
    if (!this.consumerTag) this.consumerTag = message.fields.consumerTag;

    // parse the message
    var content = this.parseMessage(message);
    var channel = this.channel;

    Promise.from(this.read(content, message)).then(
      function() {
        debug('ack', message.properties);
        // ack!
        channel.ack(message);
      },
      function(err) {
        debug('nack', message.properties, err);
        channel.nack(message);
      }
    );
  },

  /**
  Close the channel. Shortcut for channel.close.
  */
  close: function() {
    if (!this.consuming) return Promise.from(null);
    return this.channel.close().then(
      function() {
        this.unbindChannel(this.channel);
        this.consuming = false;
        this.channel = null;
      }.bind(this)
    );
  }
};

module.exports = Consumer;
