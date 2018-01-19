const assert = require('assert');
const expressions = require('../lib/expressions');

suite('expression expansion success', function() {

  function scenario(expr, params, result, shouldFail=false) {
    return () => {
      let missing = [];
      try {
        assert.deepEqual(expressions.expandExpressionTemplate(expr, params, missing), result);
      } catch (err) {
        if (shouldFail) {
          return;
        }
        throw err;
      }
      if (shouldFail) {
        throw new Error('Should have failed!');
      }
    };
  }

  // These should succeed
  [
    [{AnyOf: []}, {}, {AnyOf: []}],
    [{AllOf: []}, {}, {AllOf: []}],
    [{AllOf: ['abc:<foo>']}, {foo: 'hi'}, {AllOf: ['abc:hi']}],
    [{AllOf: ['abc:<foo>:<bar>']}, {foo: 'hi', bar: 'bye'}, {AllOf: ['abc:hi:bye']}],
    [{AllOf: ['abc:<foo>:<bar>:<baz>']}, {foo: 'hi', bar: 'bye', baz: 'bing'}, {AllOf: ['abc:hi:bye:bing']}],
    [{if: 'foo', then: {AllOf: ['bar']}}, {foo: false}, undefined],
    [{if: 'foo', then: {AllOf: ['bar']}}, {foo: true}, {AllOf: ['bar']}],
    [{if: 'foo', then: {AllOf: ['bar:<baz>']}}, {foo: true, baz: 'hi'}, {AllOf: ['bar:hi']}],
    [{AllOf: [{for: 'foo', in: 'bar', each: 'aa:<foo>'}]}, {bar: ['aaa', 'bbb']}, {AllOf: ['aa:aaa', 'aa:bbb']}],
    [
      {AllOf: [{for: 'foo', in: 'bar', each: 'aa:<foo>:<b>'}]},
      {bar: ['aaa', 'bbb'], b: 'q'},
      {AllOf: ['aa:aaa:q', 'aa:bbb:q']}],
  ].map(([e, p, r]) => {
    test(`${JSON.stringify(e)} with ${JSON.stringify(p)} renders correctly`, scenario(e, p, r));
  });

  // These should fail
  [
    [{if: 'foo', then: {AllOf: ['bar']}}, {foo: 'abc'}],
    [{if: 'foo', then: {AllOf: ['bar']}}, {foo: 0}],
    [{if: 'foo', then: {AllOf: ['bar']}}, {foo: 1}],
    [{if: 'foo', then: {AllOf: ['bar']}}, {foo: 1.4}],
    [{if: 'foo', then: {AllOf: ['bar']}}, {foo: new Date()}],
    [{AllOf: [{for: 'foo', in: 'bar', each: 'aa:<foo>'}]}, {bar: 'a'}],
    [{AllOf: [{for: 'foo', in: 'bar', each: 'aa:<fox>'}]}, {bar: ['a']}],
  ].map(([e, p]) => {
    test(`${JSON.stringify(e)} with ${JSON.stringify(p)} should fail`, scenario(e, p, null, 'fail!'));
  });
});

suite('expression expansion missing params', function() {

  function scenario(expr, params, shouldBeMissing) {
    return () => {
      let missing = [];
      expressions.expandExpressionTemplate(expr, params, missing);
      assert.deepEqual(shouldBeMissing, missing);
    };
  }

  [
    [{AnyOf: ['abc:<foo>']}, {}, ['<foo>']],
    [{AnyOf: ['abc:<foo>']}, {bar: 'a'}, ['<foo>']],
    [{AnyOf: ['abc:<foo>', '<bar>']}, {}, ['<foo>', '<bar>']],
    [{AnyOf: []}, {}, []],
    [{AnyOf: ['abc:<foo>:<bar>']}, {}, ['<foo>', '<bar>']],
    [{if: 'foo', then: {AllOf: ['bar']}}, {}, ['foo']],
    [{AllOf: [{for: 'foo', in: 'bar', each: 'aa:<foo>'}]}, {}, ['bar']],
    [{AllOf: [{for: 'foo', in: 'bar', each: 'aa:<foo>:<baz>'}]}, {bar: ['a']}, ['<baz>']],
  ].map(([e, p, m]) => {
    test(`${JSON.stringify(e)} with ${JSON.stringify(p)} is missing ${JSON.stringify(m)}`, scenario(e, p, m));
  });
});
