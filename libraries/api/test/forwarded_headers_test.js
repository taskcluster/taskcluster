import assert from 'node:assert';
import testing from '@taskcluster/lib-testing';
import { remoteAuthentication } from '../src/middleware/auth.js';

suite(testing.suiteName(), () => {
  // Run a request through the middleware and return what was handed to the
  // signature validator.
  const validatedRequest = async ({ headers = {}, ip = '10.1.2.3' }) => {
    let validated;
    const signatureValidator = async data => {
      validated = data;
      return { status: 'auth-success', clientId: 'test-client', scopes: [] };
    };
    const middleware = remoteAuthentication({
      signatureValidator,
      entry: { scopes: null, route: '/test' },
    });
    const req = {
      method: 'GET',
      originalUrl: '/api/test/v1/test',
      query: {},
      ip,
      headers: { host: 'tc.example.com', authorization: 'Hawk id="x"', ...headers },
    };
    await middleware(req, { set() {} }, () => {});
    await req.clientId();
    return validated;
  };

  test('valid X-Forwarded-Port is used', async () => {
    const v = await validatedRequest({ headers: { 'x-forwarded-port': '8443' } });
    assert.strictEqual(v.port, 8443);
  });

  test('first of several X-Forwarded-Port values is used', async () => {
    const v = await validatedRequest({ headers: { 'x-forwarded-port': ['8443', '80'] } });
    assert.strictEqual(v.port, 8443);
  });

  for (const bad of ['zioc1', '', '-1', '70000', '1.5']) {
    test(`invalid X-Forwarded-Port ${JSON.stringify(bad)} falls back to the request port`, async () => {
      const v = await validatedRequest({ headers: { 'x-forwarded-port': bad } });
      assert.strictEqual(v.port, 80);
    });
  }

  test('invalid X-Forwarded-Port still honours X-Forwarded-Proto', async () => {
    const v = await validatedRequest({
      headers: { 'x-forwarded-port': 'zioc1', 'x-forwarded-proto': 'https' },
    });
    assert.strictEqual(v.port, 443);
  });

  test('valid source IPs are passed on', async () => {
    assert.strictEqual((await validatedRequest({ ip: '192.0.2.7' })).sourceIp, '192.0.2.7');
    assert.strictEqual((await validatedRequest({ ip: '2001:db8::1' })).sourceIp, '2001:db8::1');
  });

  for (const bad of ['unknown', '', null, '1.2.3']) {
    test(`source IP ${JSON.stringify(bad)} that is not an IP address is omitted`, async () => {
      const v = await validatedRequest({ ip: bad });
      assert.strictEqual(v.sourceIp, undefined);
    });
  }
});
