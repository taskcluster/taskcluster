suite('API', function() {
  var assert      = require('assert');
  var assume      = require('assume');
  var debug       = require('debug')('test:api:createhook');
  var helper      = require('./helper');

  if (!helper.setupApi()) {
    this.pending = true;
  }

  // Use the same hook definition for everything
  var hookDef = require('./test_definition');
  var taskDef = require('./test_definition');

  suite("createHook", function() {
    test("creates a hookd", async () => {
        var r1 = await helper.hooks.createHook('foo', 'bar', hookDef);
        var r2 = await helper.hooks.hook('foo', 'bar');
        assume(r1).deep.equals(r2);
    });

    test("with invalid scopes", async () => {
      helper.scopes('hooks:modify-hook:wrong/scope');
      await helper.hooks.createHook('foo', 'bar', hookDef).then(
          () => { throw new Error("Expected an authentication error"); },
          (err) => { debug("Got expected authentication error: %s", err); });
    });

    test("fails if resource already exists", async () => {
      await helper.hooks.createHook('foo', 'bar', hookDef);
      return helper.hooks.createHook('foo', 'bar', hookDef).then(
          () => { throw new Error("Expected an error"); },
          (err) => { debug("Got expected error: %s", err); });
    });

    test("creates associated group", async () => {
      await helper.hooks.createHook('baz', 'qux', hookDef);
      var r1 = await helper.hooks.listHookGroups();
      assume(r1.groups.length).equals(1);
      assume(r1.groups).contains('baz');
    });

    test("without a schedule", async () => {
      await helper.hooks.createHook('foo', 'bar', hookDef);
      var r1 = await helper.hooks.getHookSchedule('foo', 'bar');
      assume(r1).is.empty();
    });

    test("with a daily schedule", async () => {
      let input = require('./test_definition');
      input.schedule = {format: {type: "daily", timeOfDay: [0]}};
      await helper.hooks.createHook('foo', 'bar', input);
      var r1 = await helper.hooks.getHookSchedule('foo', 'bar');
      assert(new Date(r1.nextScheduledDate) > new Date());
    });
  });

  suite("updateHook", function() {
    test("updates a hook", async () => {
      var input = require('./test_definition');
      var r1 = await helper.hooks.createHook('foo', 'bar', input);

      input.metadata.owner = "test@test.org";
      var r2 = await helper.hooks.updateHook('foo', 'bar', input);
      assume(r2.metadata).deep.not.equals(r1.metadata);
      assume(r2.task).deep.equals(r1.task);
    });

    test("updateHook fails if resource doesn't exist", async () => {
      helper.hooks.updateHook('foo', 'bar', hookDef).then(
          () => { throw new Error("Expected an error"); },
          (err) => { assume(err.status).equals(404); });
    });
  });

  suite("removeHook", function() {
    test("removes a hook", async () => {
        await helper.hooks.createHook('foo', 'bar', hookDef);
        await helper.hooks.removeHook('foo', 'bar');
        helper.hooks.hook('foo', 'bar').then(
            () => { throw new Error("The resource should not exist"); },
            (err) => { assume(err.status).equals(404); });
    });

    test("removed empty groups", async () => {
        await helper.hooks.createHook('foo', 'bar', hookDef);
        var r1 = await helper.hooks.listHooks('foo');
        assume(r1.hooks.length).equals(1);

        await helper.hooks.removeHook('foo', 'bar');
        helper.hooks.listHooks('foo').then(
            () => { throw new Error("The group should not exist"); },
            (err) => { assume(err.status).equals(404); });
    });
  });

  suite("listHookGroups", function() {
    test("returns valid length of groups", async () => {
      var input = ['foo', 'bar', 'baz', 'qux'];
      for (let i =0; i < input.length; i++) {
        await helper.hooks.createHook(input[i], 'testHook1', hookDef);
        await helper.hooks.createHook(input[i], 'testHook2', hookDef);
      }
      var r1 = await helper.hooks.listHookGroups();
      assume(r1.groups.length).equals(input.length);
    });
  });

  suite("getTriggerToken", function() {
    test("returns the same token", async () => {
      await helper.hooks.createHook('foo', 'bar', hookDef);
      var r1 = await helper.hooks.getTriggerToken('foo', 'bar');
      var r2 = await helper.hooks.getTriggerToken('foo', 'bar');
      assume(r1).deep.equals(r2);
    });
  });

  suite("resetTriggerToken", function() {
    test("creates a new token", async () => {
      await helper.hooks.createHook('foo', 'bar', hookDef);
      var r1 = await helper.hooks.getTriggerToken('foo', 'bar');
      var r2 = await helper.hooks.resetTriggerToken('foo', 'bar');
      assume(r1).deep.not.equals(r2);
      var r3 = await helper.hooks.getTriggerToken('foo', 'bar');
      assume(r2).deep.equals(r2);
    });
  });

  suite("triggerHook", function() {
    test("should launch task", async () => {
      await helper.hooks.createHook('foo', 'bar', hookDef);
      await helper.hooks.triggerHook('foo', 'bar');
    });
  });

  suite("triggerHookWithToken", function() {
    test("successfully triggers task", async () => {
      let payload = {};
      await helper.hooks.createHook('foo', 'bar', hookDef);
      var res = helper.hooks.getTriggerToken('foo', 'bar');
      helper.hooks.triggerHookWithToken('foo', 'bar', res.token, payload);
    });

    test("should fail with invalid token", async () => {
      let payload = {};
      await helper.hooks.createHook('foo', 'bar', hookDef);
      helper.hooks.triggerHookWithToken('foo', 'bar', 'invalidtoken', payload).then(
          () => { throw new Error("This operation should have failed!"); },
          (err) => { assume(err.statusCode).equals(401); });
    });

    test("fails with invalidated token", async () => {
      let payload = {};
      await helper.hooks.createHook('foo', 'bar', hookDef);
      let res = helper.hooks.getTriggerToken('foo', 'bar');

      await helper.hooks.resetTriggerToken('foo', 'bar');
      helper.hooks.triggerHookWithToken('foo', 'bar', res.token, payload).then(
          () => { throw new Error("This operation should have failed!"); },
          (err) => { assume(err.statusCode).equals(401); });
    });
  });
});
