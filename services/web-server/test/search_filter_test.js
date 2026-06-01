import assert from 'node:assert';
import testing from '@taskcluster/lib-testing';
import substringFilter from '../src/utils/searchFilter.js';

suite(testing.suiteName(), () => {
  const clients = [
    { clientId: 'static/taskcluster/web-server' },
    { clientId: 'mozilla-auth0/ad|Mozilla-LDAP|alice/treeherder' },
    { clientId: 'project/releng/fxci-config/apply' },
  ];

  test('null array returns empty array', function() {
    assert.deepEqual(substringFilter('anything', 'clientId', null), []);
    assert.deepEqual(substringFilter('anything', 'clientId', undefined), []);
  });

  test('empty/absent searchTerm returns the array unchanged', function() {
    assert.deepEqual(substringFilter('', 'clientId', clients), clients);
    assert.deepEqual(substringFilter(null, 'clientId', clients), clients);
    assert.deepEqual(substringFilter(undefined, 'clientId', clients), clients);
  });

  test('matches a case-insensitive substring on the named field', function() {
    assert.deepEqual(
      substringFilter('RELENG', 'clientId', clients),
      [{ clientId: 'project/releng/fxci-config/apply' }],
    );
  });

  test('returns all rows whose field contains the term', function() {
    const result = substringFilter('mozilla', 'clientId', clients);
    assert.equal(result.length, 1);
    assert.equal(result[0].clientId, 'mozilla-auth0/ad|Mozilla-LDAP|alice/treeherder');
  });

  test('non-matching term returns empty array', function() {
    assert.deepEqual(substringFilter('nonexistent-zzz', 'clientId', clients), []);
  });

  test('treats a missing/null field value as no match', function() {
    const rows = [{ clientId: 'abc' }, { other: 'def' }, { clientId: null }];
    assert.deepEqual(substringFilter('a', 'clientId', rows), [{ clientId: 'abc' }]);
  });

  test('the search term is treated as a literal string, not a regex', function() {
    const rows = [{ name: 'a.b' }, { name: 'axb' }];
    // '.' must match only the literal dot, not "any character"
    assert.deepEqual(substringFilter('a.b', 'name', rows), [{ name: 'a.b' }]);
  });

  test('a $where-style payload is just an inert literal string (no execution path)', function() {
    const rows = [{ name: 'safe' }];
    // Nothing interprets operators anymore; this can only ever fail to match.
    assert.deepEqual(substringFilter('(function(){return true})()', 'name', rows), []);
  });
});
