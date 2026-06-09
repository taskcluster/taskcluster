import assert from 'assert';
import http from 'http';
import { gzipSync, gunzipSync } from 'zlib';
import request from 'superagent';
import { APIBuilder } from '../src/index.js';
import helper from './helper.js';
import libUrls from 'taskcluster-lib-urls';
import testing from '@taskcluster/lib-testing';

suite(testing.suiteName(), function() {
  const u = path => libUrls.api(helper.rootUrl, 'test', 'v1', path);

  const builder = new APIBuilder({
    title: 'Test Api',
    description: 'Test api for compression',
    serviceName: 'test',
    apiVersion: 'v1',
    context: [],
  });

  // Endpoint returning a payload large enough to exceed the 1024-byte threshold
  builder.declare({
    method: 'get',
    route: '/large-payload',
    name: 'largePayload',
    scopes: null,
    title: 'Large Payload',
    category: 'API Library',
    stability: APIBuilder.stability.stable,
    description: 'Returns a large JSON payload',
  }, function(req, res) {
    res.reply({ data: 'x'.repeat(2000) });
  });

  // Endpoint returning a payload below the 1024-byte threshold
  builder.declare({
    method: 'get',
    route: '/small-payload',
    name: 'smallPayload',
    scopes: null,
    title: 'Small Payload',
    category: 'API Library',
    stability: APIBuilder.stability.stable,
    description: 'Returns a small JSON payload',
  }, function(req, res) {
    res.reply({ ok: true });
  });

  // Endpoint that sets Content-Encoding itself before sending a body.
  // Mirrors services/web-server/src/api.js profile which returns
  // pre-gzipped bytes; the middleware must leave that response alone.
  builder.declare({
    method: 'get',
    route: '/pre-encoded',
    name: 'preEncoded',
    scopes: null,
    title: 'Pre-encoded Payload',
    category: 'API Library',
    stability: APIBuilder.stability.stable,
    description: 'Returns a pre-gzipped payload',
  }, function(req, res) {
    const payload = Buffer.from('y'.repeat(2000));
    const gzipped = gzipSync(payload);
    res.set('Content-Type', 'application/json');
    res.set('Content-Encoding', 'gzip');
    res.send(gzipped);
  });

  suiteSetup(async function() {
    await helper.setupServer({ builder, context: {} });
  });

  suiteTeardown(async function() {
    await helper.teardownServer();
  });

  test('large response is gzip-compressed when client accepts gzip', async function() {
    const res = await request
      .get(u('/large-payload'))
      .set('Accept-Encoding', 'gzip');
    assert.strictEqual(res.headers['content-encoding'], 'gzip',
      'Expected Content-Encoding: gzip for large payload');
    // superagent transparently decodes gzip; verify the body round-trips intact.
    assert.strictEqual(res.body.data.length, 2000);
  });

  test('small response is not compressed (below 1024-byte threshold)', async function() {
    const res = await request
      .get(u('/small-payload'))
      .set('Accept-Encoding', 'gzip');
    assert(!res.headers['content-encoding'],
      'Expected no Content-Encoding for small payload below threshold');
  });

  test('response is not compressed when client does not accept gzip', async function() {
    const res = await request
      .get(u('/large-payload'))
      .set('Accept-Encoding', 'identity');
    assert(!res.headers['content-encoding'],
      'Expected no Content-Encoding when client does not accept gzip');
    assert.strictEqual(res.body.data.length, 2000);
  });

  test('pre-set Content-Encoding is preserved (no double compression)', async function() {
    // Fetch raw response bytes without client-side decompression. If the
    // middleware had re-gzipped, gunzipping once would yield still-gzipped
    // bytes (starting with 0x1f 0x8b) instead of the plaintext body.
    const { headers, body } = await new Promise((resolve, reject) => {
      http.get(u('/pre-encoded'), { headers: { 'Accept-Encoding': 'gzip' } }, res => {
        const chunks = [];
        res.on('data', c => chunks.push(c));
        res.on('end', () => resolve({ headers: res.headers, body: Buffer.concat(chunks) }));
        res.on('error', reject);
      }).on('error', reject);
    });
    assert.strictEqual(headers['content-encoding'], 'gzip');
    const decoded = gunzipSync(body).toString();
    assert.strictEqual(decoded, 'y'.repeat(2000));
  });
});
