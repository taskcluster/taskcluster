import path from 'path';
import testing from 'taskcluster-lib-testing';

const __dirname = new URL('.', import.meta.url).pathname;

suite(testing.suiteName(), function() {
  testing.schemas({
    schemasetOptions: {
      folder: path.join(__dirname, 'schemas'),
      serviceName: 'test',
    },
    serviceName: 'test',
    cases: [
      {
        schema: 'case1.json#',
        path: 'case1.json',
        success: true,
      }, {
        schema: 'case1.json#',
        path: 'case2.json',
        success: false,
      },
    ],
    basePath: path.join(__dirname, 'validate'),
  });
});
