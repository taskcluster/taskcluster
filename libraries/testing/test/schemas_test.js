const libTesting = require('../');
const path = require('path');
const libUrls = require('taskcluster-lib-urls');

suite('testing.schema', function() {
  libTesting.schemas({
    schemasetOptions: {
      folder: path.join(__dirname, 'schemas'),
      serviceName: 'test',
    },
    serviceName: 'test',
    cases: [
      {
        schema:   'case1.json#',
        path:     'case1.json',
        success:  true,
      }, {
        schema:   'case1.json#',
        path:     'case2.json',
        success:  false,
      },
    ],
    basePath:     path.join(__dirname, 'validate'),
  });
});
