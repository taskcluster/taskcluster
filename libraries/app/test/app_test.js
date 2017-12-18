suite('app', function() {
  var assert  = require('assert');
  var path    = require('path');
  var subject = require('../');
  var request = require('superagent');

  // Test app creation
  suite('app({port: 1459})', function() {
    var server;

    suiteSetup(async function() {

      let fakeDocs = {documentationUrl: 'https://fake.documentation/url'};
      // Create a simple app
      var app = subject({
        port:             1459,
        env:              'development',
        forceSSL:         false,
        forceHSTS:        true,
        trustProxy:       false,
        docs:             fakeDocs,
      });
      assert(app, 'Should have an app');

      // Add an end-point
      app.get('/test', function(req, res) {
        res.status(200).send('Okay this works');
      });

      // Create server
      server = await app.createServer();
    });

    test('get /test', async function() {
      var res = await request.get('http://localhost:1459/test');
      assert(res.ok, 'Got response');
      assert.equal(res.text, 'Okay this works', 'Got the right text');
    });

    test('hsts header', async function() {
      var res = await request.get('http://localhost:1459/test');
      assert.equal(res.headers['strict-transport-security'], 'max-age=7776000000; includeSubDomains');
    });

    test('/robots.txt', async function() {
      var res = await request.get('http://localhost:1459/robots.txt');
      assert(res.ok, 'Got response');
      assert.equal(res.text, 'User-Agent: *\nDisallow: /\n', 'Got the right text');
      assert.equal(res.headers['content-type'], 'text/plain; charset=utf-8');
    });

    test('get /', async function() {
      var res = await request
        .get('http://localhost:1459/')
        .ok(res => res.status < 500);
      assert(res.status, 404, 'Got 404 status');
      assert(res.text.includes('https://fake.documentation/url'));
    }); 

    suiteTeardown(function() {
      return server.terminate();
    });
  });
});

