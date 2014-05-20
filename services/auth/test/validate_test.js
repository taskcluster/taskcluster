/**
 * Test cases each defined with relative path, schema identifier and success as
 * either true or false depending on whether or not validation should succeed
 *
 * Add your schema tests below...
 */
var testCases = [
  {
    path:     'schemas/client-scopes-ok1.json',
    schema:   'http://schemas.taskcluster.net/auth/v1/client-scopes-response.json#',
    success:  true
  }, {
    path:     'schemas/client-scopes-ok2.json',
    schema:   'http://schemas.taskcluster.net/auth/v1/client-scopes-response.json#',
    success:  true
  }, {
    path:     'schemas/client-scopes-ok3.json',
    schema:   'http://schemas.taskcluster.net/auth/v1/client-scopes-response.json#',
    success:  true
  }, {
    path:     'schemas/client-scopes-fail1.json',
    schema:   'http://schemas.taskcluster.net/auth/v1/client-scopes-response.json#',
    success:  false
  }, {
    path:     'schemas/client-scopes-fail2.json',
    schema:   'http://schemas.taskcluster.net/auth/v1/client-scopes-response.json#',
    success:  false
  }, {
    path:     'schemas/client-credentials-ok.json',
    schema:   'http://schemas.taskcluster.net/auth/v1/client-credentials-response.json#',
    success:  true
  }, {
    path:     'schemas/client-credentials-fail.json',
    schema:   'http://schemas.taskcluster.net/auth/v1/client-credentials-response.json#',
    success:  false
  }
];

suite("validate", function() {
  var fs          = require('fs');
  var path        = require('path');
  var assert      = require('assert');
  var base        = require('taskcluster-base');
  var validator = null;

  // Setup validator
  setup(function() {
    return base.validator({
      folder:           path.join(__dirname, '..', 'schemas'),
      constants:        require('../schemas/constants'),
    }).then(function(validator_) {
      validator = validator_;
    });
  });

  // Create a test for each test case
  testCases.forEach(function(testCase) {
    test(testCase.path, function() {
      // Load test data
      var filePath = path.join(__dirname, testCase.path);
      var data = fs.readFileSync(filePath, {encoding: 'utf-8'});
      var json = JSON.parse(data);

      // Validate json
      var errors = validator.check(json, testCase.schema);

      // Test errors
      if(testCase.success) {
        if (errors !== null) {
          console.log("Errors:");
          errors.forEach(function(error) {
            console.log(error);
          });
        }
        assert(errors === null, "Schema doesn't match test for " + testCase.path);
      } else {
        assert(errors !== null, "Schema matches unexpectedly test for " + testCase.path);
      }
    });
  }, this);

  // Release validator
  teardown(function() {
    validator = null;
  })
});
