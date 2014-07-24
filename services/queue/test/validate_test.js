var base        = require('taskcluster-base');
var path        = require('path');

suite('validate', function() {
  // Run test cases using schemas testing utility from taskcluster-base
  base.testing.schemas({
    validator: {
      folder:       path.join(__dirname, '..', 'schemas'),
      constants:    require('../schemas/constants')
    },
    basePath:       path.join(__dirname, 'validate_test'),
    schemaPrefix:   'http://schemas.taskcluster.net/',
    cases: [
      {
        schema:   'queue/v1/task.json#',
        path:     'task.json',
        success:  true,
      }
    ]
  });
});
