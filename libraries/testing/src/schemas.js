
var _             = require('lodash');
var assert        = require('assert');
var debug         = require('debug')('taskcluster-lib-testing:schemas');
var fs            = require('fs');
var SchemaSet     = require('taskcluster-lib-validate');
var libUrls       = require('taskcluster-lib-urls');
var path          = require('path');

/**
 * Test schemas with positive and negative test cases. This will call
 * `setup` and `test` which are assumed to exist in global scope.
 * Basically, it only makes sense to use from inside `suite` in a mocha test.
 *
 * options:{
 *   schemasetOptions: {}  // options for SchemaSet constructor
 *   cases: [
 *     {
 *       // JSON schema id to test against
 *       schema:    'https://tc-tests.localhost/schemas/somesvc/v1/foo.json#',
 *       path:      'test-file.json', // Path to test file
 *       success:   true || false     // Is test expected to fail
 *     }
 *   ],
 *   basePath:      path.join(__dirname, 'validate')  // basePath test cases
 * }
 */
var schemas = function(options) {
  // Validate options
  assert(options.schemasetOptions, 'Options must be given for validator');
  assert(options.cases instanceof Array, 'Array of cases must be given');

  let validate;
  setup(async function() {
    const schemaset = new SchemaSet(options.schemasetOptions);
    validate = await schemaset.validator(libUrls.testRootUrl());
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
      var schema = testCase.schema;

      // Validate json
      var error = validate(json, schema);

      // Test errors
      if (testCase.success) {
        if (error !== null) {
          debug('Errors: %j', error);
        }
        assert(error === null,
          'Schema doesn\'t match test for ' + testCase.path);
      } else {
        assert(error !== null,
          'Schema matches unexpectedly test for ' + testCase.path);
      }
    });
  });
};

// Export schemas
module.exports = schemas;
