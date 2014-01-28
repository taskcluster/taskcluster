var Promise = require('promise');
var debug = require('debug')('amqpworker:schema');

function namesOf(property) {
  return function() {
    if (!this[property]) return [];

    return this[property].map(function(value) {
      return value[0];
    });
  };
}

function defineExchangesAndQueues(schema, channel) {
  return new Promise(function(accept, reject) {
    // handle channel errors while this is running.
    channel.once('error', reject);

    // if there are no exchanges or queues this empty array is still fine.
    var promises = [];

    if (schema.exchanges) {
      schema.exchanges.forEach(function(exchange) {
        debug('create exchange', exchange);
        promises.push(channel.assertExchange.apply(channel, exchange));
      });
    }


    if (schema.queues) {
      schema.queues.forEach(function(queue) {
        debug('create queue', queue);
        promises.push(channel.assertQueue.apply(channel, queue));
      });
    }

    Promise.all(promises).then(
      function() {
        // remove rejection listener since its someone else's problem now.
        channel.removeListener('error', reject);

        // pass through the channel for the next consumer
        return accept(channel);
      },
      reject
    );
  });
}

function bindQueues(schema, channel) {
  return new Promise(function(accept, reject) {
    channel.once('error', reject);

    var promises = [];

    schema.binds.forEach(function(bind) {
      debug('bind queue', bind);
      promises.push(channel.bindQueue.apply(channel, bind));
    });

    Promise.all(promises).then(
      function() {
        // same deal pass through on success.
        channel.removeListener('error', reject);
        return accept(channel);
      },
      reject
    );
  });
}

function Schema(schema) {
  this.exchanges = schema.exchanges;
  this.queues = schema.queues;
  this.binds = schema.binds;
}

Schema.prototype = {
  exchanges: null,
  queues: null,
  binds: null,

  exchangeNames: namesOf('exchanges'),

  queueNames: namesOf('queues'),

  define: function(connection) {
    return new Promise(function(accept, reject) {
      // order is important
      return connection.createChannel().then(
        // exchanges and queues can be created in parallel
        defineExchangesAndQueues.bind(this, this)
      ).then(
        // once the schema is defined we can then bind our exchange/queue information.
        bindQueues.bind(this, this)
      ).then(
        // then finally we can close the channel
        function(channel) { return channel.close(); }
      ).then(
        accept,
        reject
      );
    }.bind(this));
  },

  destroy: function(connection) {
    var exchanges = this.exchangeNames();
    var queues = this.queueNames();

    return new Promise(function(accept, reject) {
      connection.createChannel().then(function(channel) {
        // on channel error reject destroy
        channel.once('error', reject);

        // build up a list of promises to execute
        var promises = [];

        exchanges.forEach(function(exchange) {
          debug('destroy exchange', exchange);
          promises.push(channel.deleteExchange(exchange));
        });

        queues.forEach(function(queue) {
          debug('destroy queue', queue);
          promises.push(channel.deleteQueue(queue));
        });

        return Promise.all(promises).then(
          function() {
            channel.removeListener('error', reject);
          }
        ).then(
          channel.close.bind(channel)
        );
      }).then(
        accept,
        reject
      );
    });
  },

  purge: function(connection) {
    var queues = this.queueNames();

    return new Promise(function(accept, reject) {
      connection.createChannel().then(
        function(channel) {
          channel.once('error', reject);

          var promises = queues.map(function(queue) {
            return channel.purgeQueue(queue);
          });

          return Promise.all(promises).then(
            function() {
              channel.removeListener('error', reject);
              return channel.close();
            }
          );
        }
      ).then(
        accept,
        reject
      );
    });
  }
};


module.exports = Schema;
