suite('List hook groups', function () {
  var debug = require('debug')('test:api:triggerhooks');
  var assume = require('assume');
  var helper = require('./helper');

  var taskDef = require('./test_definition');

  test("getTriggerToken returns the same token", async () => {
    await helper.hooks.createHook('foo', 'bar', taskDef);
    var r1 = await helper.hooks.getTriggerToken('foo', 'bar');
    var r2 = await helper.hooks.getTriggerToken('foo', 'bar');
    assume(r1).deep.equals(r2);
  });

  test("resetTriggerToken creates a new token", async () => {
    await helper.hooks.createHook('foo', 'bar', taskDef);
    var r1 = await helper.hooks.getTriggerToken('foo', 'bar');
    var r2 = await helper.hooks.resetTriggerToken('foo', 'bar');
    assume(r1).deep.not.equals(r2);
    var r3 = await helper.hooks.getTriggerToken('foo', 'bar');
    assume(r2).deep.equals(r2);
  });

  test("triggerHook should launch task", async () => {
    await helper.hooks.createHook('foo', 'bar', taskDef);
    await helper.hooks.triggerHook('foo', 'bar');
  });

  test("triggerHookWithToken sucessfully triggers task", async () => {
    let payload = {};
    await helper.hooks.createHook('foo', 'bar', taskDef);
    var res = helper.hooks.getTriggerToken('foo', 'bar');
    helper.hooks.triggerHookWithToken('foo', 'bar', res.token, payload);
  });

  test("triggerHookWithToken should fail with invalid token", async () => {
    let payload = {};
    await helper.hooks.createHook('foo', 'bar', taskDef);
    helper.hooks.triggerHookWithToken('foo', 'bar', 'invalidtoken', payload).then(
        () => { throw new Error("This operation should have failed!"); },
        (err) => { assume(err.statusCode).equals(401); });
  });

  test("triggerHookWithToken fails with invalidated token", async () => {
    let payload = {};
    await helper.hooks.createHook('foo', 'bar', taskDef);
    let res = helper.hooks.getTriggerToken('foo', 'bar');

    await helper.hooks.resetTriggerToken('foo', 'bar');
    helper.hooks.triggerHookWithToken('foo', 'bar', res.token, payload).then(
        () => { throw new Error("This operation should have failed!"); },
        (err) => { assume(err.statusCode).equals(401); });
  });
});
