import testing from '@taskcluster/lib-testing';
import path from 'path';

const __dirname = new URL('.', import.meta.url).pathname;

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
        path: 'sample-aws-worker-pool-full.json',
        success: true,
      },
      {
        schema: 'v1/config-aws.json#',
        path: 'sample-aws-config.json',
        success: true,
      },
      {
        schema: 'v1/config-google.json#',
        path: 'sample-google-config.json',
        success: true,
      },
      {
        schema: 'v1/config-azure.json#',
        path: 'sample-azure-config.json',
        success: true,
      },
    ],
  });
});
