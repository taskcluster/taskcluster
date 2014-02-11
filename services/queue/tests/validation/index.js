var validate    = require('../../utils/validate');
var fs          = require('fs');
var path        = require('path');

/**
 * Test cases each defined with relative path, schema identifier and success as
 * either true or false depending on whether or not validation should succeed
 *
 * Add your schema tests below...
 */
var testCases = [
  {
    path:     'v1/queue:task-pending.json',
    schema:   'http://schemas.taskcluster.net/v1/queue:task-pending.json#',
    success:  true,
  }, {
    path:     'v1/uuid.json',
    schema:   'http://schemas.taskcluster.net/v1/common/uuid.json#',
    success:  true,
  }, {
    path:     'v1/task-status.json',
    schema:   'http://schemas.taskcluster.net/v1/task-status.json#',
    success:  true,
  },
];

// define a test for each test file
testCases.forEach(function(testCase) {
  exports[testCase.path] = function(test) {
    // Load test data
    var filePath = path.join(__dirname, testCase.path);
    var data = fs.readFileSync(filePath, {encoding: 'utf-8'});
    var json = JSON.parse(data);

    // Validate json
    var errors = validate(json, testCase.schema);

    // Test errors
    if(testCase.success) {
      test.ok(errors === null, "Schema doesn't match test for " + testCase.path);
      if (errors !== null) {
        console.log("Errors:");
        errors.forEach(function(error) {
          console.log(error);
        });
      }
    } else {
      test.ok(errors !== null, "Schema matches unexpectedly test for " + testCase.path);
    }

    test.done();
  };
});
