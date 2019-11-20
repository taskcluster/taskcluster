const assert = require('assert');
const {removeGivenScopes, validExpression, satisfiesExpression, scopesSatisfying, scopeIntersection} = require('../src');
const testing = require('taskcluster-lib-testing');

suite(testing.suiteName(), function() {
  suite('scope expression validity:', function() {

    function scenario(expr, shouldFail = false) {
      return () => {
        try {
          assert(validExpression(expr));
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

    // All of the following are invalid
    test('empty is not OK', scenario({}, 'should-fail'));
    test('array is not OK', scenario([], 'should-fail'));
    test('int is not OK', scenario(12, 'should-fail'));
    test('wrong key is not OK', scenario({Foo: ['abc']}, 'should-fail'));
    test('multiple keys is not OK', scenario({AnyOf: ['abc'], AllOf: ['abc']}, 'should-fail'));
    test('int value is not OK', scenario({AnyOf: 1}, 'should-fail'));
    test('string value is not OK', scenario({AnyOf: 'scope:bar'}, 'should-fail'));
    test('object value is not OK', scenario({AnyOf: {}}, 'should-fail'));

    // All of the following should be valid
    [
      'hello-world',
      'scope:foo',
      {AnyOf: []},
      {AllOf: []},
      {AnyOf: ['abc']},
      {AllOf: ['abc']},
      {AnyOf: [{AnyOf: ['scope:foo:thing']}]},
      {AllOf: [{AllOf: ['scope:foo:thing', 'scope:bar:thing']}]},
      {AnyOf: [{AllOf: ['scope:foo:thing']}]},
      {AllOf: [{AnyOf: ['scope:foo:thing', 'scope:bar:thing']}]},
      {AllOf: [{AnyOf: [{AllOf: ['foo']}, {AllOf: ['bar']}]}]},
    ].forEach(c => {
      test(`${JSON.stringify(c)} is OK`, scenario(c));
    });
  });

  suite('scope expression satisfaction:', function() {
    // We want to be confident that `satisfiesExpression` and `scopesSatisfyingExpression` both
    // accept and reject the same inputs, so they are tested in parallel.

    function satisfiesExpressionScenario(scopes, expr, shouldFail = false) {
      return () => {
        try {
          assert(satisfiesExpression(scopes, expr));
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

    function scopesSatisfyingScenario(scopes, expr, expected) {
      return () => {
        const got = scopesSatisfying(scopes, expr);
        assert.deepEqual(got, expected);
      };
    }

    function scopesSatisfyingSatisfiesScenario(scopes, expr) {
      return () => {
        assert(satisfiesExpression(
          scopesSatisfying(scopes, expr),
          expr));
      };
    }

    function scopesSatisfyingIsSubsetScenario(scopes, expr) {
      return () => {
        const satisfyingScopes = scopesSatisfying(scopes, expr);
        // assert that satisfyingScopes is a subset of scopes by checking
        // that it does not change under intersection
        assert.deepEqual(
          scopeIntersection(scopes, satisfyingScopes),
          satisfyingScopes);
      };
    }

    // The following should _not_ succeed
    [
      [[], {AnyOf: []}],
      [[], 'missing-scope'],
      [['wrong-scope'], 'missing-scope'],
      [['ghi'], {AnyOf: ['abc', 'def']}],
      [['ghi*'], {AnyOf: ['abc', 'def']}],
      [['ghi', 'fff'], {AnyOf: ['abc', 'def']}],
      [['ghi*', 'fff*'], {AnyOf: ['abc', 'def']}],
      [['abc'], {AnyOf: ['ghi']}],
      [['abc*'], {AllOf: ['abc', 'ghi']}],
      [[''], {AnyOf: ['abc', 'def']}],
      [['abc:def'], {AnyOf: ['abc', 'def']}],
      [['xyz', 'abc'], {AllOf: [{AnyOf: [{AllOf: ['foo']}, {AllOf: ['bar']}]}]}],
      [['a*', 'b*', 'c*'], {AllOf: ['bx', 'cx', {AnyOf: ['xxx', 'yyyy']}]}],
    ].forEach(([s, e]) => {
      test(`${JSON.stringify(e)} is _not_ satisfied by ${JSON.stringify(s)}`, satisfiesExpressionScenario(s, e, 'should-fail'));
      test(`${JSON.stringify(e)} does _not_ have scopes satisfying ${JSON.stringify(s)}`, scopesSatisfyingScenario(s, e, undefined));
    });

    // The following should succeed
    [
      [[], {AllOf: []}, []],
      [['A'], {AllOf: ['A']}, ['A']],
      [['A', 'B'], 'A', ['A']],
      [['a*', 'b*', 'c*'], 'abc', ['abc']],
      [['abc'], {AnyOf: ['abc', 'def']}, ['abc']],
      [['def'], {AnyOf: ['abc', 'def']}, ['def']],
      [['abc', 'def'], {AnyOf: ['abc', 'def']}, ['abc', 'def']],
      [['abc*'], {AnyOf: ['abc', 'def']}, ['abc']],
      [['abc*'], {AnyOf: ['abc']}, ['abc']],
      [['abc*', 'def*'], {AnyOf: ['abc', 'def']}, ['abc', 'def']],
      [['foo'], {AllOf: [{AnyOf: [{AllOf: ['foo']}, {AllOf: ['bar']}]}]}, ['foo']],
      [['a*', 'b*', 'c*'], {AnyOf: ['cfoo', 'dfoo']}, ['cfoo']],
      [['a*', 'b*', 'c*'], {AnyOf: ['bx', 'by']}, ['bx', 'by']],
      [['a*', 'b*', 'c*'], {AllOf: ['bx', 'cx']}, ['bx', 'cx']],
      // complex expression with only some AnyOf branches matching
      [
        ['a*', 'b*', 'c*'],
        {AnyOf: [
          {AllOf: ['ax', 'jx']}, // doesn't match
          {AllOf: ['bx', 'cx']}, // does match
          'bbb',
        ]},
        ['bbb', 'bx', 'cx'],
      ],

    ].forEach(([s, e, sat]) => {
      test(`${JSON.stringify(e)} is satisfied by ${JSON.stringify(s)}`, satisfiesExpressionScenario(s, e));
      test(`${JSON.stringify(e)} has scopes ${JSON.stringify(sat)} satisfying ${JSON.stringify(s)}`, scopesSatisfyingScenario(s, e, sat));
      test(`${JSON.stringify(e)}: Satisfying scopes ${JSON.stringify(sat)} actually do satisfy ${JSON.stringify(s)}`, scopesSatisfyingSatisfiesScenario(s, e));
      test(`${JSON.stringify(e)}: Satisfying scopes ${JSON.stringify(sat)} are a subset of ${JSON.stringify(s)}`, scopesSatisfyingIsSubsetScenario(s, e));
    });

  });

  suite('scope expression failure explanation:', function() {

    function scenario(scopes, expr, explanation) {
      return () => {
        assert.deepEqual(explanation, removeGivenScopes(scopes, expr));
      };
    }

    [
      [[], {AllOf: []}, null],
      [['a'], {AllOf: ['a']}, null],
      [['a'], {AllOf: ['a', 'b']}, 'b'],
      [[], {AnyOf: []}, {AnyOf: []}],
      [['a'], {AnyOf: ['a', 'b']}, null],
      [['c'], {AnyOf: ['a', 'b']}, {AnyOf: ['a', 'b']}],
      [['ghi'], {AnyOf: ['abc', 'def']}, {AnyOf: ['abc', 'def']}],
      [['ghi'], {AllOf: ['abc', 'def', 'ghi']}, {AllOf: ['abc', 'def']}],
      [['ghi*', 'fff*'], {AnyOf: ['abc', 'def']}, {AnyOf: ['abc', 'def']}],
      [
        ['xyz', 'abc'],
        {AllOf: [{AnyOf: [{AllOf: ['foo']}, {AllOf: ['bar']}]}]},
        {AnyOf: ['foo', 'bar']},
      ],
    ].forEach(([s, e, expl]) => {
      test(`Given ${JSON.stringify(s)}, ${JSON.stringify(e)} is explained by ${JSON.stringify(expl)}}`,
        scenario(s, e, expl));
    });
  });
});
