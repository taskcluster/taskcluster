const assert = require('assert');
const {App} = require('../');
const request = require('superagent');
const express = require('express');
const isUUID = require('is-uuid');
const testing = require('taskcluster-lib-testing');
const path = require('path');
const mockFs = require('mock-fs');

const REPO_ROOT = path.join(__dirname, '../../../');

suite(testing.suiteName(), function() {

  // Test app creation
  suite('app({port: 1459})', function() {
    let server;

    suiteSetup(async function() {
      // this library expects an "api" to have an express method that sets it up..
      const fakeApi = {
        express(app) {
          const router = express.Router();
          router.get('/test', function(req, res) {
            res.status(200).send('Okay this works');
          });
          router.get('/req-id', function(req, res) {
            res.status(200).send(JSON.stringify({
              valueSet: req.traceId,
            }));
          });
          app.use('/api/test/v1', router);
        },
      };

      // Create a simple app
      server = await App({
        port: 1459,
        env: 'development',
        forceSSL: false,
        forceHSTS: true,
        trustProxy: false,
        apis: [fakeApi],
      });
    });

    test('get /test', async function() {
      const res = await request.get('http://localhost:1459/api/test/v1/test');
      assert(res.ok, 'Got response');
      assert.equal(res.text, 'Okay this works', 'Got the right text');
    });

    test('hsts header', async function() {
      const res = await request.get('http://localhost:1459/api/test/v1/test');
      assert.equal(res.headers['strict-transport-security'], 'max-age=7776000000; includeSubDomains');
    });

    test('trace ids', async function() {
      const res = await request
        .get('http://localhost:1459/api/test/v1/req-id')
        .set('x-taskcluster-trace-id', 'foo/123')
        .buffer();
      const body = JSON.parse(res.text);
      assert.equal(res.headers['x-for-trace-id'], 'foo/123');
      assert.equal(body.valueSet, 'foo/123');
    });

    test('trace ids (created when none passed in)', async function() {
      const res = await request
        .get('http://localhost:1459/api/test/v1/req-id')
        .buffer();
      const body = JSON.parse(res.text);
      assert(isUUID.v4(res.headers['x-for-trace-id']));
      assert(isUUID.v4(res.headers['x-for-request-id']));
      assert(isUUID.v4(body.valueSet));
    });

    test('/__version__', async function() {
      mockFs({
        [path.resolve(REPO_ROOT, 'version.json')]: JSON.stringify({ version: 'v99.99.99' }),
      });

      const res = await request.get('http://localhost:1459/__version__');
      assert(res.ok, 'Got response');
      assert.equal(res.body.version, 'v99.99.99', 'Got the right version');
      assert.equal(res.headers['content-type'], 'application/json; charset=utf-8');
    });

    test('/__heartbeat__', async function() {
      const res = await request.get('http://localhost:1459/__heartbeat__');
      assert(res.ok, 'Got response');
      assert.equal(res.status, 200);
      assert.equal(res.headers['content-type'], 'application/json; charset=utf-8');
    });

    test('/__lbheartbeat__', async function() {
      const res = await request.get('http://localhost:1459/__lbheartbeat__');
      assert(res.ok, 'Got response');
      assert.equal(res.status, 200);
      assert.equal(res.headers['content-type'], 'application/json; charset=utf-8');
    });

    test('/not-found', async function() {
      try {
        await request.get('http://localhost:1459/api/test/v1/notfound');
      } catch (err) {
        assert.equal(err.status, 404, 'Status code is 404');
        assert.equal(err.response.body.error, 'Not found', 'Response message is correct');
        assert.equal(err.response.headers['content-type'], 'application/json; charset=utf-8',
          'Correct content-type is set to headers');
        assert.equal(
          err.response.headers['content-security-policy'],
          'report-uri /__cspreport__;default-src \'none\';frame-ancestors \'none\';',
          'Correct CSP is set in headers');
        return;
      }
      throw new Error('expected exception not seen');
    });

    teardown(function() {
      mockFs.restore();
    });

    suiteTeardown(function() {
      return server.terminate();
    });
  });
});
