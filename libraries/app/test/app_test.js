suite('app', function() {
  var assert  = require('assert');
  var path    = require('path');
  var subject = require('../');
  var request = require('superagent');

  // Test app creation
  test('app({port: 1459})', async function() {
    // Create a simple app
    var app = subject({
      port:       1459,
      env:        'development',
      forceSSL:   false,
      forceHSTS:  true,
      trustProxy: false,
    });
    assert(app, 'Should have an app');

    // Add an end-point
    app.get('/test', function(req, res) {
      res.status(200).send('Okay this works');
    });

    // Create server
    var server = await app.createServer();
    var res = await request.get('http://localhost:1459/test');
    assert(res.ok, 'Got response');
    assert.equal(res.text, 'Okay this works', 'Got the right text');
    assert.equal(res.headers['strict-transport-security'], 'max-age=7776000000; includeSubDomains');
    return server.terminate();
  });
});

