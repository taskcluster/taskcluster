var validate    = require('../utils/validate');
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
    path:     'schemas/task-graph-example.json',
    schema:   'http://schemas.taskcluster.net/scheduler/v1/task-graph.json#',
    success:  true,
  }, {
    path:     'schemas/invalid-task-graph-example.json',
    schema:   'http://schemas.taskcluster.net/scheduler/v1/task-graph.json#',
    success:  false,
  }
];

// define a test for each test file
testCases.forEach(function(testCase) {
  exports[testCase.path] = function(test) {
    test.expect(1);

    // Setup validate if needed, before we continue
    validate.setup().then(function() {
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

      // okay tests are done
      test.done();
    });
  };
});
