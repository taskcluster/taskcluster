suite('publisher', function() {
  var Consumer = require('./consumer'),
      Publisher = require('./publisher'),
      Message = require('./message'),
      Schema = require('./examples/schema');

  var EXCHANGE = Schema.exchangeNames()[0],
      QUEUE = Schema.queueNames()[0];

  var amqp = require('amqplib');

  var connection;
  setup(function() {
    return amqp.connect().then(function(con) {
      connection = con;
    });
  });

  setup(function() {
    return Schema.define(connection);
  });

  teardown(function() {
    return Schema.destroy(connection);
  });

  teardown(function() {
    return connection.close();
  });

  var subject;
  setup(function() {
    subject = new Publisher(connection);
  });

  suite('#publish', function() {
    var object = { wooot: true };
    var published = new Message(
      object,
      { messageId: 'custom' }
    );

    setup(function(done) {
      // publish should be a promise!
      return subject.publish(
        EXCHANGE,
        QUEUE,
        published
      );
    });

    test('consume message', function(done) {
      var messageCount = 0;

      var consume = new Consumer(connection, function(content, message) {
        // verify round trip encoding
        assert.deepEqual(content, object);

        // verify we pass options
        assert.equal(
          published.options.messageId,
          message.properties.messageId
        );

        // send another message after the first
        messageCount++;
        // after we process the first send the second
        if (messageCount === 1) subject.publish(EXCHANGE, QUEUE, published);
        // yey- this works in both no channel mode and with a channel
        if (messageCount === 2) done();
      });

      consume.consume(QUEUE);
    });
  });

  suite('#close', function() {
    test('without a channel', function(done) {
      return subject.close();
    });

    suite('with a channel', function() {
      setup(function(done) {
        return subject.openChannel();
      });

      test('close', function(done) {
        assert.ok(subject.channel);
        return subject.close().then(
          function() {
            assert.ok(!subject.channel, 'channel is unset');
          }
        );
      });
    });
  });

  suite('channel event proxying', function() {

    // trigger the bind
    setup(function() {
      return subject.openChannel();
    });

    test('error', function(done) {
      subject.once('error', done);
      subject.channel.emit('error');
    });

    test('close', function(done) {
      subject.once('error', done);
      subject.channel.emit('error');
    });

    test('unbind', function(done) {
      function error() {
        done(new Error('should not call emitter'));
      }

      subject.once('error', error);
      var channel = subject.channel;

      subject.close().then(
        function() {

          // swallow the error on emit error.
          try {
            channel.emit('error');
          } catch (e) {
          }

          done();
        }
      );
    });
  });
});
