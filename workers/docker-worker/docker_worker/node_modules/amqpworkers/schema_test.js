suite('amqp/schema', function() {
  var Schema = require('./schema'),
      Promise = require('promise');

  var amqp = require('amqplib');
  var schemaConfig = require('./examples/schema_config.json');
  var subject = new Schema(schemaConfig);

  var channel,
      connection;

  setup(function() {
    return amqp.connect().then(
      function(_con) {
        connection = _con;
        return connection.createConfirmChannel();
      }
    ).then(
      function(_chan) {
        return channel = _chan;
      }
    );
  });

  var EXCHANGE = schemaConfig.exchanges[0][0],
      QUEUE = schemaConfig.queues[0][0];

  suite('#destroy', function() {
    setup(function() {
      // create some related thing
      return Promise.all([
        channel.assertExchange(EXCHANGE, 'direct'),
        channel.assertQueue(QUEUE)
      ]);
    });

    setup(function() {
      return subject.destroy(connection);
    });

    test('exchange is removed', function(done) {
      channel.once('error', function(err) {
        assert.ok(err.message.match(EXCHANGE));
        assert.ok(err.message.match(/404/));
        done();
      });

      channel.checkExchange(EXCHANGE);
    });

    test('queue is removed', function(done) {
      channel.once('error', function(err) {
        assert.ok(err.message.match(QUEUE));
        assert.ok(err.message.match(/404/));
        done();
      });

      channel.checkQueue(QUEUE);
    });
  });

  suite('#define', function() {
    setup(function() {
      return subject.define(connection);
    });

    teardown(function() {
      subject.destroy(connection);
    });

    test('pubsub', function(done) {
      var buffer = new Buffer('xxx');

      // publish to exchange
      var pub = channel.publish(
        EXCHANGE, QUEUE, buffer
      );

      // attempt the consume
      channel.consume(QUEUE, function(msg) {
        if (!msg) return;
        assert.equal(msg.content.toString(), buffer.toString());
        done();
      });
    });
  });

  suite('#purge', function() {
    setup(function() {
      return subject.define(connection);
    });

    teardown(function() {
      return subject.destroy(connection);
    });

    // append to the queue
    setup(function(done) {
      channel.publish(
        EXCHANGE,
        QUEUE,
        new Buffer('xxx'),
        {},
        done
      );
    });

    setup(function() {
      return subject.purge(connection);
    });

    test('removes messages', function(done) {
      return channel.assertQueue(QUEUE).then(function(queue) {
        assert.equal(queue.messageCount, 0);
      });
    });
  });
});
