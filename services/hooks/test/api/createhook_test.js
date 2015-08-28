suite('Create hook', function() {
  var assert      = require('assert');
  var assume      = require('assume');
  var debug       = require('debug')('test:api:createhook');
  var helper      = require('./helper');

  // Use the same hook definition for everything
  var hookDef = require('./test_definition');

  test("createHook", async () => {
      var r1 = await helper.hooks.createHook('foo', 'bar', hookDef);
      var r2 = await helper.hooks.hook('foo', 'bar');
      assume(r1).deep.equals(r2);
  });

  test("createHook with invalid scopes", async () => {
    helper.scopes('hooks:modify-hook:wrong/scope');
    await helper.hooks.createHook('foo', 'bar', hookDef).then(
        () => { throw new Error("Expected an authentication error"); },
        (err) => { debug("Got expected authentication error: %s", err); });
  });

  test("listHookGroups returns valid length of groups", async () => {
    var input = ['foo', 'bar', 'baz', 'qux'];
    for (let i =0; i < input.length; i++) {
      await helper.hooks.createHook(input[i], 'testHook', hookDef);
    }
    var r1 = await helper.hooks.listHookGroups();
    assume(r1.groups.length).equals(input.length);
  });
});
