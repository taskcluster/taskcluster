const helper = require('./helper');
const path = require('path');
const testing = require('taskcluster-lib-testing');

/**
 * Test cases each defined with relative path, schema identifier and success as
 * either true or false depending on whether or not validation should succeed
 *
 * Add your schema tests below...
 */
const testCases = [
  {
    path:     'authenticate-hawk-request.json',
    schema:   'v1/authenticate-hawk-request.yml',
    success:  true,
  }, {
    path:     'authenticate-hawk-request-ipv4.json',
    schema:   'v1/authenticate-hawk-request.json#',
    success:  true,
  }, {
    path:     'create-role-request1.json',
    schema:   'v1/create-role-request.json#',
    success:  true,
  }, {
    path:     'create-role-request2.json',
    schema:   'v1/create-role-request.json#',
    success:  true,
  }, {
    path:     'create-role-request3.json',
    schema:   'v1/create-role-request.json#',
    success:  true,
  }, {
    path:     'create-role-request-bad-scope1.json',
    schema:   'v1/create-role-request.json#',
    success:  false,
  }, {
    path:     'create-role-request-bad-scope2.json',
    schema:   'v1/create-role-request.json#',
    success:  false,
  }, {
    path:     'create-role-request-bad-scope3.json',
    schema:   'v1/create-role-request.json#',
    success:  false,
  }, {
    path:     'create-role-request-bad-scope4.json',
    schema:   'v1/create-role-request.json#',
    success:  false,
  }, {
    path:     'create-role-request-bad-scope5.json',
    schema:   'v1/create-role-request.json#',
    success:  false,
  }, {
    path:     'create-role-request-unique.json',
    schema:   'v1/create-role-request.json#',
    success:  false,
  }, {
    path:     'authenticate-hawk-request-bad.json',
    schema:   'v1/authenticate-hawk-request.json#',
    success:  false,
  }, {
    path:     'create-client-request-no-scopes.json',
    schema:   'v1/create-client-request.json#',
    success:  true,
  }, {
    path:     'create-client-request-with-scopes.json',
    schema:   'v1/create-client-request.json#',
    success:  true,
  },
];

suite(helper.suiteName(__filename), function() {
  // Run test cases using schemas testing utility from taskcluster-lib-testing
  testing.schemas({
    schemasetOptions: {
      serviceName: 'auth',
      folder: path.join(__dirname, '..', 'schemas'),
    },
    serviceName: 'auth',
    basePath: path.join(__dirname, 'schema-test-data'),
    cases: testCases,
  });
});
