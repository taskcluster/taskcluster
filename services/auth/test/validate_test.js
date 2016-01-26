/**
 * Test cases each defined with relative path, schema identifier and success as
 * either true or false depending on whether or not validation should succeed
 *
 * Add your schema tests below...
 */
var testCases = [
  {
    path:     'authenticate-hawk-request.json',
    schema:   'auth/v1/authenticate-hawk-request.json#',
    success:  true
  }, {
    path:     'authenticate-hawk-request-ipv4.json',
    schema:   'auth/v1/authenticate-hawk-request.json#',
    success:  true
  }, {
    path:     'create-role-request1.json',
    schema:   'auth/v1/create-role-request.json#',
    success:  true
  }, {
    path:     'create-role-request2.json',
    schema:   'auth/v1/create-role-request.json#',
    success:  true
  }, {
    path:     'create-role-request3.json',
    schema:   'auth/v1/create-role-request.json#',
    success:  true
  }, {
    path:     'create-role-request-bad-scope1.json',
    schema:   'auth/v1/create-role-request.json#',
    success:  false
  }, {
    path:     'create-role-request-bad-scope2.json',
    schema:   'auth/v1/create-role-request.json#',
    success:  false
  }, {
    path:     'create-role-request-bad-scope3.json',
    schema:   'auth/v1/create-role-request.json#',
    success:  false
  }, {
    path:     'create-role-request-bad-scope4.json',
    schema:   'auth/v1/create-role-request.json#',
    success:  false
  }, {
    path:     'create-role-request-bad-scope5.json',
    schema:   'auth/v1/create-role-request.json#',
    success:  false
  }, {
    path:     'create-role-request-unique.json',
    schema:   'auth/v1/create-role-request.json#',
    success:  false
  }, {
    path:     'authenticate-hawk-request-bad.json',
    schema:   'auth/v1/authenticate-hawk-request.json#',
    success:  false
  }, {
    path:     'create-client-request-no-scopes.json',
    schema:   'auth/v1/create-client-request.json#',
    success:  true
  }, {
    path:     'create-client-request-with-scopes.json',
    schema:   'auth/v1/create-client-request.json#',
    success:  true
  }
];

var path        = require('path');
var base        = require('taskcluster-base');

suite('validate', function() {
  // Run test cases using schemas testing utility from taskcluster-base
  base.testing.schemas({
    validator: {
      folder:         path.join(__dirname, '..', 'schemas'),
      constants:      require('../schemas/constants'),
      schemaPrefix:   'auth/v1/'
    },
    basePath:       path.join(__dirname, 'schemas'),
    schemaPrefix:   'http://schemas.taskcluster.net/',
    cases:          testCases
  });
});
