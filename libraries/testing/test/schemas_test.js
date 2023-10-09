import path from 'path';
import testing from 'taskcluster-lib-testing';
import url from 'url';

const __dirname = url.fileURLToPath(new URL('.', import.meta.url));

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
