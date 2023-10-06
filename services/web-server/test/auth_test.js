import assert from 'assert';
import request from 'superagent';
import helper from './helper';
import testing from 'taskcluster-lib-testing';
import credentialsQuery from './fixtures/credentials.graphql';

helper.secrets.mockSuite(testing.suiteName(), [], function(mock, skipping) {
  helper.withDb(mock, skipping);
  helper.withServer(mock, skipping);
  helper.resetTables(mock, skipping);

  test('Unauthorized', async function() {
    const res = await request
      .post(`http://localhost:${helper.serverPort}/graphql`)
      .send({ query: credentialsQuery });

    assert.equal(res.body.errors[0].message, 'Authentication is required to generate credentials');
  });
});
