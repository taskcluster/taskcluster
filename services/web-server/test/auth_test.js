import assert from 'node:assert';
import request from 'superagent';
import helper from './helper.js';
import testing from '@taskcluster/lib-testing';

helper.secrets.mockSuite(testing.suiteName(), [], (mock, skipping) => {
  helper.withDb(mock, skipping);
  helper.withServer(skipping);
  helper.resetTables();

  test('Unauthorized', async () => {
    try {
      await request.post(`http://localhost:${helper.serverPort}/login/credentials`);
      assert.fail('Expected the request to fail');
    } catch (err) {
      assert.equal(err.status, 401);
      assert.equal(err.response.body.message, 'Authentication is required to generate credentials');
    }
  });

  test('credential refresh with an already-used session cookie succeeds', async () => {
    helper.load.cfg('taskcluster.credentials', { clientId: 'static/web-server-test', accessToken: 'secret' });

    const login = await request.get(`http://localhost:${helper.serverPort}/login/test`);
    const cookie = login.headers['set-cookie'].find(c => c.startsWith('connect.sid=')).split(';')[0];

    for (let i = 0; i < 2; i++) {
      const res = await request.post(`http://localhost:${helper.serverPort}/login/credentials`).set('Cookie', cookie);
      assert.equal(res.status, 200);
      assert(res.body.credentials.clientId);
    }
  });
});
