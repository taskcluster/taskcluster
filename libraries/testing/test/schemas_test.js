const libTesting = require('../');
const path = require('path');
const libUrls = require('taskcluster-lib-urls');

suite('testing.schema', function() {
  libTesting.schemas({
    schemasetOptions: {
      folder: path.join(__dirname, 'schemas'),
      serviceName: 'test',
    },
    cases: [
      {
        schema:   'https://tc-tests.localhost/schemas/test/case1.json#',
        path:     'case1.json',
        success:  true,
      }, {
        schema:   'https://tc-tests.localhost/schemas/test/case1.json#',
        path:     'case2.json',
        success:  false,
      },
    ],
    basePath:     path.join(__dirname, 'validate'),
  });
});
