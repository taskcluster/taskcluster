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

  test("createHook fails if resource already exists", async () => {
    await helper.hooks.createHook('foo', 'bar', hookDef);
    helper.hooks.createHook('foo', 'bar', hookDef).then(
        () => { throw new Error("Expected an error"); },
        (err) => { debug("Got expected error: %s", err); });
  });

  test("createHook creates associated group", async () => {
    await helper.hooks.createHook('baz', 'qux', hookDef);
    var r1 = await helper.hooks.listHookGroups();
    assume(r1.groups.length).equals(1);
    assume(r1.groups).contains('baz');
  });

  test("updateHook fails if resource doesnt exists", async () => {
    helper.hooks.updateHook('foo', 'bar', hookDef).then(
        () => { throw new Error("Expected an error"); },
        (err) => { assume(err.status).equals(404); });
  });

  test("updateHook", async () => {
    var input = require('./test_definition');
    var r1 = await helper.hooks.createHook('foo', 'bar', input);

    input.metadata.owner = "test@test.org";
    var r2 = await helper.hooks.updateHook('foo', 'bar', input);
    assume(r2.metadata).deep.not.equals(r1.metadata);
    assume(r2.task).deep.equals(r1.task);
  });

  test("removeHook", async () => {
      await helper.hooks.createHook('foo', 'bar', hookDef);
      await helper.hooks.removeHook('foo', 'bar');
      helper.hooks.hook('foo', 'bar').then(
          () => { throw new Error("The resource should not exist"); },
          (err) => { assume(err.status).equals(404); });
  });

  test("removeHook removed empty groups", async () => {
      await helper.hooks.createHook('foo', 'bar', hookDef);
      var r1 = await helper.hooks.listHooks('foo');
      assume(r1.hooks.length).equals(1);

      await helper.hooks.removeHook('foo', 'bar');
      helper.hooks.listHooks('foo').then(
          () => { throw new Error("The group should not exist"); },
          (err) => { assume(err.status).equals(404); });
  });

  test("createHook without a schedule", async () => {
    await helper.hooks.createHook('foo', 'bar', hookDef);
    var r1 = await helper.hooks.getHookSchedule('foo', 'bar');
    assume(r1).is.empty();
  });

  test("createHook with a daily schedule", async () => {
    let input = require('./test_definition');
    input.schedule = {format: {type: "daily", timeOfDay: [0]}};
    await helper.hooks.createHook('foo', 'bar', input);
    var r1 = await helper.hooks.getHookSchedule('foo', 'bar');
    assert(new Date(r1.nextScheduledDate) > new Date());
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
