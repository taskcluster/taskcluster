const assert = require('assert');
const request = require('superagent');
const helper = require('./helper');
const testing = require('taskcluster-lib-testing');
const credentialsQuery = require('./fixtures/credentials.graphql');

helper.secrets.mockSuite(testing.suiteName(), ['azure'], function(mock, skipping) {
  helper.withEntities(mock, skipping);
  helper.withServer(mock, skipping);

  test('Unauthorized', async function() {
    const res = await request
      .post(`http://localhost:${helper.serverPort}/graphql`)
      .send({ query: credentialsQuery });

    assert.equal(res.body.errors[0].message, 'Authentication is required to generate credentials');
  });
});
