suite('ScopeResolver (normalizeScopes)', () => {
  let ScopeResolver = require('../src/scoperesolver');
  let assert = require('assert');
  let _ = require('lodash');

  // Test cases for normalizeScopes
  [
    {
      scopes:   ['*'],
      result:   ['*'],
    }, {
      scopes:   ['*', 'test'],
      result:   ['*'],
    }, {
      scopes:   ['*', 'test', 'te*'],
      result:   ['*'],
    }, {
      scopes:   ['*', 'te*'],
      result:   ['*'],
    }, {
      scopes:   ['test*', 't*'],
      result:   ['t*'],
    }, {
      scopes:   ['test*', 'ab*'],
      result:   ['test*', 'ab*'],
    }, {
      scopes:   ['abc', 'ab*', 'a', 'ab'],
      result:   ['ab*', 'a'],
    }, {
      scopes:   ['a', 'b', 'c'],
      result:   ['a', 'b', 'c'],
    }, {
      scopes:   ['ab', 'a', 'abc*'],
      result:   ['ab', 'a', 'abc*'],
    }, {
      scopes:   ['a*', 'ab', 'a', 'abc*'],
      result:   ['a*'],
    },
  ].forEach(({scopes, result}) => {
    test(`normalizeScopes(${scopes.join(', ')})`, () => {
      if (_.xor(ScopeResolver.normalizeScopes(scopes), result).length !== 0) {
        console.error('Expected: ');
        console.error(result);
        console.error('Got: ');
        console.error(ScopeResolver.normalizeScopes(scopes));
        assert(false, 'Expected normalizeScopes(' + scopes.join(', ') +
                      ') === ' + result.join(', '));
      }
    });
  });
});
