suite('End to End', () => {
  let assert = require('assert');
  let path = require('path');
  let documenter = require('../');
  let debug = require('debug')('test');
  let validator = require('taskcluster-lib-validate');

  let validate = null;

  setup(async () => {
    validate = await validator({
      folder: path.join(__dirname, 'schemas'),
    });
  });

  test('simplest case with nothing to do', function() {
    return documenter({
      folder: path.join(__dirname, 'docs'),
      bucket: 'taskcluster-raw-docs-test',
      project: 'taskcluster-lib-docs',
      version: '0.0.1',
    });
  });

  test('only schemas', function() {
    return documenter({
      folder: path.join(__dirname, 'docs'),
      bucket: 'taskcluster-raw-docs-test',
      project: 'taskcluster-lib-docs',
      version: '0.0.1',
      schemas: validate.schemas,
    });
  });

});
