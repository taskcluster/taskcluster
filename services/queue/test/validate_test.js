import testing from 'taskcluster-lib-testing';
import path from 'path';

const __dirname = new URL('.', import.meta.url).pathname;

suite(testing.suiteName(), () => {
  // Run test cases using schemas testing utility from taskcluster-base
  testing.schemas({
    schemasetOptions: {
      folder: path.join(__dirname, '..', 'schemas'),
      serviceName: 'queue',
    },
    basePath: path.join(__dirname, 'validate_test'),
    serviceName: 'queue',
    cases: [
      {
        schema: 'v1/create-task-request.json#',
        path: 'task.json',
        success: true,
      },
    ],
  });
});
