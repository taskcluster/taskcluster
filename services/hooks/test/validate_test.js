var base = require('taskcluster-base');
var path = require('path');

suite('validate', function() {
  base.testing.schemas({
    validator: {
      folder: path.join(__dirname, '..', 'schemas'),
      constants: require('../schemas/constants'),
      schemaPrefix: 'hooks/v1/',
      preload: [
        'http://schemas.taskcluster.net/queue/v1/create-task-request.json'
    ]},
    basePath: path.join(__dirname, 'validate_test'),
    schemaPrefix: 'http://schemas.taskcluster.net/',
    cases: [
    {
      schema: 'hooks/v1/create-hook-request.json',
      path: 'test.json',
      success: true,
    }]
  });
});
