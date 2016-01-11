"use strict";

var _             = require('lodash');
var assert        = require('assert');
var debug         = require('debug')('taskcluster-lib-testing:schemas');
var base          = require('taskcluster-base');
var path          = require('path');
/**
 * Test schemas with a positive and negative test cases. This will call
 * `setup` and `test` which are assumed to exist in global scope.
 * Basically, it only makes sense to use from inside `suite` in a mocha test.
 *
 * options:{
 *   validator: {}  // options for base.validator
 *   cases: [
 *     {
 *       schema:    '...json'         // JSON schema identifier to test against
 *       path:      'test-file.json', // Path to test file
 *       success:   true || false     // Is test expected to fail
 *     }
 *   ],
 *   basePath:      path.join(__dirname, 'validate')  // basePath test cases
 *   schemaPrefix:  'http://'         // Prefix for schema identifiers
 * }
 */
var schemas = function(options) {
  options = _.defaults({}, options, {
    schemaPrefix:     ''  // Defaults to no schema prefix
  });

  // Validate options
  assert(options.validator, "Options must be given for validator");
  assert(options.cases instanceof Array, "Array of cases must be given");

  var validator = null;
  setup(function() {
    return base.validator(options.validator).then(function(validator_) {
      validator = validator_;
    });
  });

  // Create test cases
  options.cases.forEach(function(testCase) {
    test(testCase.path, function() {
      // Load test data
      var filePath = testCase.path;
      // Prefix with basePath if a basePath is given
      if (options.basePath) {
        filePath = path.join(options.basePath, filePath);
      }
      var data = fs.readFileSync(filePath, {encoding: 'utf-8'});
      var json = JSON.parse(data);

      // Find schema
      var schema = options.schemaPrefix + testCase.schema;

      // Validate json
      var errors = validator.check(json, schema);

      // Test errors
      if(testCase.success) {
        if (errors !== null) {
          debug("Errors: %j", errors);
        }
        assert(errors === null,
               "Schema doesn't match test for " + testCase.path);
      } else {
        assert(errors !== null,
               "Schema matches unexpectedly test for " + testCase.path);
      }
    });
  });
};

// Export schemas
exports.schemas = schemas;

