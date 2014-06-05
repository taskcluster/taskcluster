suite('testing.LocalApp (additional)', function() {
  var base      = require('../../');
  var debug     = require('debug')('base:test:testing:localapp');
  var request   = require('superagent-promise');
  var assert    = require('assert');
  var path      = require('path');
  var Promise   = require('promise');

  // Create server
  var server = new base.testing.LocalApp({
    command:  path.join(__dirname, '..', 'bin', 'app.js'),
    cwd:      path.join(__dirname, '..'),
    name:     'app.js',
  });

  // Create server number 2
  var server2 = new base.testing.LocalApp({
    command:  path.join(__dirname, '..', 'bin', 'app.js'),
    args:     ['45454'],
    cwd:      path.join(__dirname, '..'),
    name:     'app.js',
  });

  /** Test that we can launch two instances */
  test('launch two instances', function() {
    return Promise.all(
      server.launch(),
      server2.launch()
    ).then(function(baseUrls) {
      var baseUrl = baseUrls[0];
      return request.get(baseUrl + 'test').end().then(function(res) {
        assert(res.text == 'Hello World', "Expected Hello World");
      });
    }).then(function() {
      return Promise.all(
        server.terminate(),
        server2.terminate()
      );
    });
  });

  // Create server that crashes
  var serverCrash = new base.testing.LocalApp({
    command:  path.join(__dirname, '..', 'bin', 'app.js'),
    args:     ['CRASH'],
    cwd:      path.join(__dirname, '..'),
    name:     'app.js',
  });

  /** Test that crash detection works */
  test('detect crash', function() {
    return serverCrash.launch().then(function() {
      return new Promise(function(accept, reject) {
        setTimeout(reject, 2000);
        serverCrash.once('error', accept);
      });
    });
  });

  /** Test that we can terminate after a crash */
  test('terminate after crash', function() {
    return serverCrash.launch().then(function() {
      return new Promise(function(accept, reject) {
        setTimeout(reject, 2000);
        serverCrash.once('error', accept);
      });
    }).then(function() {
      return serverCrash.terminate();
    });
  });
});

