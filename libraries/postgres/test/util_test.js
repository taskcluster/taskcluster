const {dollarQuote} = require('../src/util');
const assert = require('assert');
const path = require('path');

suite(path.basename(__filename), function() {
  suite('dollarQuote', function() {
    test('simple string', function() {
      assert.equal(dollarQuote('abcd'), '$$abcd$$');
    });

    test('string containing $$', function() {
      assert.equal(dollarQuote('pre $$abcd$$ post'), '$x$pre $$abcd$$ post$x$');
    });
  });
});
