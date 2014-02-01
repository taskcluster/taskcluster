var validate    = require('../../utils/validate');
var misc        = require('../../utils/misc');
var path        = require('path');
var fs          = require('fs');

// find test files
var testFiles = misc.listFolder(__dirname).filter(function(filePath) {
  return /\.json$/.test(filePath);
});

// define a test for each test file
testFiles.forEach(function(filePath) {
  exports[filePath] = function(test) {
    // Find relative path
    var relPath = path.relative(__dirname, filePath);

    // Split by dash, last -succ.json or -fail.json indicates failure or success
    var parts = relPath.split('-');
    var failure_or_success = parts.pop().split('.')[0];
    test.ok(failure_or_success == "succ" || failure_or_success == "fail",
            "Filename must end with -succ.<index>.json or " +
            "-fail.<index>.json" + filePath);

    // Construct schema from parts
    var schema = "http://schemas.taskcluster.net/" + parts.join('-') + '.json';

    // Load test data
    var data = fs.readFileSync(filePath, {encoding: 'utf-8'});
    var json = JSON.parse(data);

    // Validate json
    var errors = validate(json, schema);

    // Test errors
    if(failure_or_success == 'succ') {
      test.ok(errors === null, "Schema doesn't match test for " + filePath);
      if (errors !== null) {
        console.log("Errors:");
        errors.forEach(function(error) {
          console.log(error);
        });
      }
    } else {
      test.ok(errors !== null, "Schema matches unexpectedly test for " + filePath);
    }

    test.done();
  };
});
