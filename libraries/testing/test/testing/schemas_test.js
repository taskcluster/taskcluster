var subject  = require('../../');
var path     = require('path');

suite('testing.schema', function() {
  subject.schemas({
    validator: {
      folder:   path.join(__dirname, 'schemas'),
      baseUrl:  'http://localhost:1234/'
    },
    cases: [
      {
        schema:   'http://localhost:1234/case1.json#',
        path:     'case1.json',
        success:  true
      }, {
        schema:   'http://localhost:1234/case1.json#',
        path:     'case2.json',
        success:  false
      }
    ],
    basePath:     path.join(__dirname, 'validate')
  });
});

suite('testing.schema w. schemaPrefix', function() {
  subject.schemas({
    validator: {
      folder:   path.join(__dirname, 'schemas'),
      baseUrl:  'http://localhost:1234/'
    },
    cases: [
      {
        schema:   'case1.json#',
        path:     'case1.json',
        success:  true
      }, {
        schema:   'case1.json#',
        path:     'case2.json',
        success:  false
      }
    ],
    basePath:     path.join(__dirname, 'validate'),
    schemaPrefix: 'http://localhost:1234/'
  });
});
