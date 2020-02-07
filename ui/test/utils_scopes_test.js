const assert = require('assert');
const { scopeIntersection } = require('../src/utils/scopes');

describe('utils_scopes_test.js', () => {
  describe('scopeIntersection', () => {
    const testScopeIntersection = (scope1, scope2, expected, message) => {
      assert.deepEqual(
        scopeIntersection(scope1, scope2).sort(),
        expected.sort(),
        message
      );
      assert.deepEqual(
        scopeIntersection(scope2, scope1).sort(),
        expected.sort(),
        message
      );
    };

    it('single exact match, [string]', () => {
      const scope = ['foo:bar'];

      testScopeIntersection(scope, scope, scope, `expected ${scope}`);
    });

    it('empty [string] in scopesets', () => {
      const scope1 = ['foo:bar'];
      const scope2 = [''];

      testScopeIntersection(scope1, scope2, [], 'expected an empty set');
    });

    it('prefix', () => {
      const scope1 = ['foo:bar'];
      const scope2 = ['foo:*'];

      testScopeIntersection(scope1, scope2, scope1, `expected ${scope1}`);
    });

    it('star not at end', () => {
      const scope1 = ['foo:bar:bing'];
      const scope2 = ['foo:*:bing'];

      testScopeIntersection(scope1, scope2, [], 'expected an empty set');
    });

    it('star at beginning', () => {
      const scope1 = ['foo:bar'];
      const scope2 = ['*:bar'];

      testScopeIntersection(scope1, scope2, [], 'expected an empty set');
    });

    it('prefix with no star', () => {
      const scope1 = ['foo:bar'];
      const scope2 = ['foo:'];

      testScopeIntersection(scope1, scope2, [], 'expected empty set');
    });

    it('star but not prefix', () => {
      const scope1 = ['foo:bar:*'];
      const scope2 = ['bar:bing'];

      testScopeIntersection(scope1, scope2, [], 'expected empty set');
    });

    it('star but not prefix', () => {
      const scope1 = ['bar:*'];
      const scope2 = ['foo:bar:bing'];

      testScopeIntersection(scope1, scope2, [], 'expected empty set');
    });

    it('disjunction', () => {
      const scope1 = ['bar:*'];
      const scope2 = ['foo:x', 'bar:x'];

      testScopeIntersection(scope1, scope2, ['bar:x'], "expected ['bar:x']");
    });

    it('conjuction', () => {
      const scope1 = ['bar:y', 'foo:x'];
      const scope2 = ['bar:*', 'foo:x'];

      testScopeIntersection(scope1, scope2, scope1, `expected ${scope1}`);
    });

    it('empty pattern', () => {
      const scope1 = [''];
      const scope2 = ['foo:bar'];

      testScopeIntersection(scope1, scope2, [], 'expected empty set');
    });

    it('empty patterns', () => {
      const scope1 = [];
      const scope2 = ['foo:bar'];

      testScopeIntersection(scope1, scope2, [], 'expected empty set');
    });

    it('bare star', () => {
      const scope1 = ['foo:bar', 'bar:bing'];
      const scope2 = ['*'];

      testScopeIntersection(scope1, scope2, scope1, `expected ${scope1}`);
    });

    it('empty conjunction in scopesets', () => {
      const scope1 = ['foo:bar'];
      const scope2 = [];

      testScopeIntersection(scope1, scope2, [], 'expected empty set');
    });
  });
});
