const testing = require('taskcluster-lib-testing');
const path = require('path');

suite('validate_test.js', () => {
  // Run test cases using schemas testing utility from taskcluster-base
  testing.schemas({
    schemasetOptions: {
      folder: path.join(__dirname, '..', 'schemas'),
      serviceName: 'queue',
    },
    basePath:       path.join(__dirname, 'validate_test'),
    cases: [
      {
        schema:   'https://tc-tests.localhost/schemas/queue/v1/create-task-request.json#',
        path:     'task.json',
        success:  true,
      },
    ],
  });
});
