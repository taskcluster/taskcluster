/**
 * Test cases each defined with relative path, schema identifier and success as
 * either true or false depending on whether or not validation should succeed
 *
 * Add your schema tests below...
 */
var testCases = [
  {
    path:     'client-scopes-ok1.json',
    schema:   'auth/v1/client-scopes-response.json#',
    success:  true
  }, {
    path:     'client-scopes-ok2.json',
    schema:   'auth/v1/client-scopes-response.json#',
    success:  true
  }, {
    path:     'client-scopes-ok3.json',
    schema:   'auth/v1/client-scopes-response.json#',
    success:  true
  }, {
    path:     'client-scopes-fail1.json',
    schema:   'auth/v1/client-scopes-response.json#',
    success:  false
  }, {
    path:     'client-scopes-fail2.json',
    schema:   'auth/v1/client-scopes-response.json#',
    success:  false
  }, {
    path:     'client-credentials-ok.json',
    schema:   'auth/v1/client-credentials-response.json#',
    success:  true
  }, {
    path:     'client-credentials-fail.json',
    schema:   'auth/v1/client-credentials-response.json#',
    success:  false
  }, {
    path:     'authenticate-hawk-request.json',
    schema:   'auth/v1/authenticate-hawk-request.json#',
    success:  true
  }, {
    path:     'authenticate-hawk-request-ipv4.json',
    schema:   'auth/v1/authenticate-hawk-request.json#',
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
