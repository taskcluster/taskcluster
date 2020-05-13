suite('test lib/util/scopes', function() {
  var scopes = require('../src/lib/util/scopes');
  const assert = require('assert');

  [
    ['noScopes',    'pfx:', { vol1: '/vol1', vol2: '/vol2' }, [], false],
    ['oneScope1',   'pfx:', { vol1: '/vol1', vol2: '/vol2' }, ['pfx:vol1'], false],
    ['oneScope2',   'pfx:', { vol1: '/vol1', vol2: '/vol2' }, ['pfx:vol2'], false],
    ['allScopes',   'pfx:', { vol1: '/vol1', vol2: '/vol2' }, ['pfx:vol1', 'pfx:vol2'], true],
    ['starScope',   'pfx:', { vol1: '/vol1', vol2: '/vol2' }, ['pfx:*'], true],
    ['noResources', 'pfx:', {}, [], true],
  ].forEach((t)=> {
    test(t[0], async function() {
      assert.equal(await scopes.hasPrefixedScopes(t[1], t[2], t[3]), t[4]);
    });
  });
});
