suite('PulseListener', function() {
  var taskcluster     = require('../');
  var Promise         = require('promise');
  var assert          = require('assert');
  var mockEvents      = require('./mockevents');
  var slugid          = require('slugid');
  var debug           = require('debug')('test:listener');

  suite('with fake PulseListener', function() {
    test('bind and listen', function() {
      // Create listener
      var listener = new taskcluster.PulseListener({
        credentials: {fake: true},
      });
      listener.bind({
        exchange: 'exchange/testy/test-exchange',
        routingKeyPattern: '#',
      });

      var result = new Promise(function(accept, reject) {
        listener.on('message', function(message) {
          try {
            assert.equal(message.payload.text, 'my message');
            assert.equal(message.exchange, 'exchange/testy/test-exchange');
            assert.equal(message.routingKey, 'some.route');
            assert.equal(message.routes.length, 1);
            assert.equal(message.routes[0], 'another.route');
          } catch (err) {
            reject(err);
          }
          accept();
        });
        listener.on('error', function(err) {
          reject(err);
        });
      });

      var published = listener.resume().then(function() {
        return listener.fakeMessage({
          payload: {text: 'my message'},
          exchange: 'exchange/testy/test-exchange',
          routingKey: 'some.route',
          routes: ['another.route'],
        });
      });

      return Promise.all([published, result]);
    });
  });
});
