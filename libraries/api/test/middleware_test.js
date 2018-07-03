const assert = require('assert');
const APIBuilder = require('../');

suite('api/middleware', function() {

  test('middleware is exported', function() {
    assert(APIBuilder.middleware);
  });
});
