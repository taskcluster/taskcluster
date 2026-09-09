import assert from 'node:assert';
import request from 'superagent';
import helper from './helper.js';
import testing from '@taskcluster/lib-testing';

helper.secrets.mockSuite(testing.suiteName(), [], (mock, skipping) => {
  helper.withDb(mock, skipping);
  helper.withServer(skipping);
  helper.resetTables();

  test('Unauthorized', async () => {
    const credentialsQuery = await helper.loadFixture('credentials.graphql');
    const res = await request.post(`http://localhost:${helper.serverPort}/graphql`).send({ query: credentialsQuery });

    assert.equal(res.body.errors[0].message, 'Authentication is required to generate credentials');
  });
});
