import assert from 'assert';
import request from 'superagent';
import helper from './helper.js';
import testing from 'taskcluster-lib-testing';

helper.secrets.mockSuite(testing.suiteName(), [], function(mock, skipping) {
  helper.withDb(mock, skipping);
  helper.withServer(mock, skipping);
  helper.resetTables(mock, skipping);

  test('Unauthorized', async function() {
    const credentialsQuery = await helper.loadFixture('credentials.graphql');
    const res = await request
      .post(`http://localhost:${helper.serverPort}/graphql`)
      .send({ query: credentialsQuery });

    assert.equal(res.body.errors[0].message, 'Authentication is required to generate credentials');
  });
});
