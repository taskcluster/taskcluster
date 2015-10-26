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
    path:     'create-role-request.json',
    schema:   'auth/v1/create-role-request.json#',
    success:  true
  }, {
    path:     'authenticate-hawk-request-bad.json',
    schema:   'auth/v1/authenticate-hawk-request.json#',
    success:  false
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
