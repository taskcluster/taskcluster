const assert = require('assert');
const request = require('superagent');
const helper = require('./helper');
const testing = require('taskcluster-lib-testing');
const credentialsQuery = require('./fixtures/credentials.graphql');

suite(testing.suiteName(), () => {
  suiteSetup(async function() {
    helper.load.save();
  });

  suiteTeardown(function() {
    helper.load.restore();
  });

  helper.withServer(false, () => false);

  test('Unauthorized', async function() {
    const res = await request
      .post(`http://localhost:${helper.serverPort}/graphql`)
      .send({ query: credentialsQuery });

    assert.equal(res.body.errors[0].message, 'Authentication is required to generate credentials');
  });
});
