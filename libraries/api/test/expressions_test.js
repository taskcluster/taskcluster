const assert = require('assert');
const ScopeExpressionTemplate = require('../lib/expressions');

suite('expression expansion success', function() {

  function scenario(expr, params, result, shouldFail=false) {
    return () => {
      let missing = [];
      try {
        assert.deepEqual(new ScopeExpressionTemplate(expr).render(params), result);
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
    [{if: 'foo', then: {AllOf: ['bar']}}, {foo: false}, null],
    [{if: 'foo', then: {AllOf: ['bar']}, else: 'test'}, {foo: false}, 'test'],
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

suite('ScopeExpressionTemplate can validate params', () => {
  [
    {
      expr: {AnyOf: ['abc:<foo>']},
      params: {foo: 'bar'},
    },
    {
      expr: {AnyOf: ['abc:<foo>']},
      params: {foo: 9},
    },
    {
      expr: {AnyOf: ['abc:<foo>', '<bar>']},
      params: {foo: 1, bar: 'hello'},
    },
    {
      expr: {AnyOf: ['abc:<foo>:<bar>']},
      params: {foo: 1, bar: 'hello'},
    },
    {
      expr: {if: 'foo', then: {AllOf: ['bar']}},
      params: {foo: true, bar: 'hello'},
    },
    {
      expr: {if: 'foo', then: {AllOf: ['bar']}},
      params: {foo: false, bar: 'hello'},
    },
    {
      expr: {AllOf: [{for: 'foo', in: 'bar', each: 'aa:<foo>'}]},
      params: {bar: ['a', 'b']},
    },
    {
      expr: {AllOf: [{for: 'foo', in: 'bar', each: 'aa:<foo>:<baz>'}]},
      params: {bar: ['a'], baz: '8'},
    },
  ].forEach(({expr, params}) => {
    test(`${JSON.stringify(expr)} works with ${JSON.stringify(params)}`, () => {
      const tmpl = new ScopeExpressionTemplate(expr);
      assert(tmpl.validate(params), `Expected ${JSON.stringify(expr)} to validate ${JSON.stringify(params)}`);
    });
  });
});
