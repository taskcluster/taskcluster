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
      await request.get(`http://localhost:${helper.serverPort}/login/credentials`);
      assert.fail('Expected the request to fail');
    } catch (err) {
      assert.equal(err.status, 401);
      assert.equal(err.response.body.message, 'Authentication is required to generate credentials');
    }
  });
});
