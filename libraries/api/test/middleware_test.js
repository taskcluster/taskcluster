const assert = require('assert');
const { APIBuilder } = require('../');
const testing = require('taskcluster-lib-testing');

suite(testing.suiteName(), function() {
  test('middleware is exported', function() {
    assert(APIBuilder.middleware);
  });
});
