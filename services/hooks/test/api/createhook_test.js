suite('Create hook', function() {
  var assert      = require('assert');
  var assume      = require('assume');
  var debug       = require('debug')('test:api:createhook');
  var helper      = require('./helper');

  // Use the same hook definition for everything
  var hookDef = require('./test_definition');

  test("createHook", async () => {
      helper.scopes('hooks:modify-hook:foo/bar');

      debug("### Create hook");
      var r1 = await helper.hooks.createHook('foo', 'bar', hookDef);

      debug("### Get hook definition");
      var r2 = await helper.hooks.hook('foo', 'bar');
      assume(r1).deep.equals(r2);
  });
});
