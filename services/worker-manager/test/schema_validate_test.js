const testing = require('taskcluster-lib-testing');
const path = require('path');

suite(testing.suiteName(), () => {
  // Run test cases using schemas testing utility from taskcluster-base
  testing.schemas({
    schemasetOptions: {
      folder: path.join(__dirname, '..', 'schemas'),
      serviceName: 'worker-manager',
    },
    basePath: path.join(__dirname, 'fixtures/schemas'),
    serviceName: 'worker-manager',
    cases: [
      {
        schema: 'v1/worker-pool-full.json#',
        path: 'sample-aws-config.json',
        success: true,
      },
    ],
  });
});
