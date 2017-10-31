import assert from 'assert';
import utils from '../lib/scopes.js';

suite('validScope', function() {
  test('Normal-looking scopes are OK', function() {
    assert(utils.validScope('auth:credentials'));
  });

  test('Star scopes are OK', function() {
    assert(utils.validScope('queue:*'));
  });

  test('Scopes with spaces are OK', function() {
    assert(utils.validScope('secrets:garbage:foo bar'));
  });

  test('Scopes with newlines are not OK', function() {
    assert(!utils.validScope('some:garbage\nauth:credentials'));
  });

  test('Scopes with nulls are not OK', function() {
    assert(!utils.validScope('some:garbage\0auth:credentials'));
  });

  test('Scopes with unicode characters are not OK', function() {
    assert(!utils.validScope('halt:\u{1f6c7}'));
  });

  test('Empty scopes are allowed', function() {
    assert(utils.validScope(''));
  });
});

suite('scopeMatch', function() {

  var mktest = function(scopePatterns, scopesets, matches) {
    return function() {
      var res;
      var exception;

      try {
        res = utils.scopeMatch(scopePatterns, scopesets);
      } catch (e) {
        res = 'exception';
        exception = e;
      }
      assert(res == matches,
        'Incorrect result for scopeMatch(' +
        JSON.stringify(scopePatterns) +
        ', ' + JSON.stringify(scopesets) + ') -> ' + res + ' ' + exception);
    };
  };

  test('single exact match, string',
    mktest(['foo:bar'], 'foo:bar', 'exception'));
  test('single exact match, [string]',
    mktest(['foo:bar'], ['foo:bar'], 'exception'));
  test('single exact match, [[string]]',
    mktest(['foo:bar'], [['foo:bar']], true));
  test('empty string in scopesets',
    mktest(['foo:bar'], '', 'exception'));
  test('empty [string] in scopesets',
    mktest(['foo:bar'], [''], 'exception'));
  test('empty [[string]] in scopesets',
    mktest(['foo:bar'], [['']], false));
  test('prefix',
    mktest(['foo:*'], [['foo:bar']], true));
  test('star not at end',
    mktest(['foo:*:bing'], [['foo:bar:bing']], false));
  test('star at beginnging',
    mktest(['*:bar'], [['foo:bar']], false));
  test('prefix with no star',
    mktest(['foo:'], [['foo:bar']], false));
  test('star but not prefix',
    mktest(['foo:bar:*'], [['bar:bing']], false));
  test('star but not prefix',
    mktest(['bar:*'], [['foo:bar:bing']], false));
  test('disjunction strings',
    mktest(['bar:*'], ['foo:x', 'bar:x'], 'exception'));
  test('disjunction [strings]',
    mktest(['bar:*'], [['foo:x'], ['bar:x']], true));
  test('conjunction',
    mktest(['bar:*', 'foo:x'], [['foo:x', 'bar:y']], true));
  test('empty pattern',
    mktest([''], [['foo:bar']], false));
  test('empty patterns',
    mktest([], [['foo:bar']], false));
  test('bare star',
    mktest(['*'], [['foo:bar', 'bar:bing']], true));
  test('empty conjunction in scopesets',
    mktest(['foo:bar'], [[]], true));
  test('non-string scopesets',
    mktest(['foo:bar'], {}, 'exception'));
  test('non-string scopeset',
    mktest(['foo:bar'], [{}], 'exception'));
  test('non-string scope',
    mktest(['foo:bar'], [[{}]], 'exception'));
  test('empty disjunction in scopesets',
    mktest(['foo:bar'], [], false));
});

suite('scopeIntersection', () => {
  const testScopeIntersection = (scope1, scope2, expected, message) => {
    assert.deepEqual(utils.scopeIntersection(scope1, scope2).sort(), expected.sort(), message);
    assert.deepEqual(utils.scopeIntersection(scope2, scope1).sort(), expected.sort(), message);
  };

  test('single exact match, [string]', () => {
    const scope = ['foo:bar'];

    testScopeIntersection(scope, scope, scope, `expected ${scope}`);
  });

  test('empty [string] in scopesets', () => {
    const scope1 = ['foo:bar'];
    const scope2 = [''];

    testScopeIntersection(scope1, scope2, [], 'expected an empty set');
  });

  test('prefix', () => {
    const scope1 = ['foo:bar'];
    const scope2 = ['foo:*'];

    testScopeIntersection(scope1, scope2, scope1, `expected ${scope1}`);
  });

  test('star not at end', () => {
    const scope1 = ['foo:bar:bing'];
    const scope2 = ['foo:*:bing'];

    testScopeIntersection(scope1, scope2, [], 'expected an empty set');
  });

  test('star at beginning', () => {
    const scope1 = ['foo:bar'];
    const scope2 = ['*:bar'];

    testScopeIntersection(scope1, scope2, [], 'expected an empty set');
  });

  test('prefix with no star', () => {
    const scope1 = ['foo:bar'];
    const scope2 = ['foo:'];

    testScopeIntersection(scope1, scope2, [], 'expected empty set');
  });

  test('star but not prefix', () => {
    const scope1 = ['foo:bar:*'];
    const scope2 = ['bar:bing'];

    testScopeIntersection(scope1, scope2, [], 'expected empty set');
  });

  test('star but not prefix', () => {
    const scope1 = ['bar:*'];
    const scope2 = ['foo:bar:bing'];

    testScopeIntersection(scope1, scope2, [], 'expected empty set');
  });

  test('disjunction', () => {
    const scope1 = ['bar:*'];
    const scope2 = ['foo:x', 'bar:x'];

    testScopeIntersection(scope1, scope2, ['bar:x'], 'expected [\'bar:x\']');
  });

  test('conjuction', () => {
    const scope1 = ['bar:y', 'foo:x'];
    const scope2 = ['bar:*', 'foo:x'];

    testScopeIntersection(scope1, scope2, scope1, `expected ${scope1}`);
  });

  test('empty pattern', () => {
    const scope1 = [''];
    const scope2 = ['foo:bar'];

    testScopeIntersection(scope1, scope2, [], 'expected empty set');
  });

  test('empty patterns', () => {
    const scope1 = [];
    const scope2 = ['foo:bar'];

    testScopeIntersection(scope1, scope2, [], 'expected empty set');
  });

  test('bare star', () => {
    const scope1 = ['foo:bar', 'bar:bing'];
    const scope2 = ['*'];

    testScopeIntersection(scope1, scope2, scope1, `expected ${scope1}`);
  });

  test('empty conjunction in scopesets', () => {
    const scope1 = ['foo:bar'];
    const scope2 = [];

    testScopeIntersection(scope1, scope2, [], 'expected empty set');
  });
});
