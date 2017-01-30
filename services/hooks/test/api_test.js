suite('API', function() {
  var _           = require('lodash');
  var assert      = require('assert');
  var assume      = require('assume');
  var debug       = require('debug')('test:api:createhook');
  var helper      = require('./helper');

  helper.setup();

  // Use the same hook definition for everything
  var hookDef = require('./test_definition');
  let dailyHookDef = _.defaults({
    schedule: ['0 0 3 * * *'],
  }, hookDef);
  let invalidHookDef = _.defaults({
    schedule: ['0 0 3 0 * *'],
  }, hookDef);

  let setHookLastFire = async (hookGroupId, hookId, lastFire) => {
    let hook = await helper.Hook.load({hookGroupId, hookId}, true);
    await hook.modify((hook) => { hook.lastFire = lastFire; });
  };

  suite('createHook', function() {
    test('creates a hook', async () => {
      var r1 = await helper.hooks.createHook('foo', 'bar', hookDef);
      var r2 = await helper.hooks.hook('foo', 'bar');
      assume(r1).deep.equals(r2);
    });

    test('with invalid scopes', async () => {
      helper.scopes('hooks:modify-hook:wrong/scope');
      await helper.hooks.createHook('foo', 'bar', hookDef).then(
          () => { throw new Error('Expected an authentication error'); },
          (err) => { debug('Got expected authentication error: %s', err); });
    });

    test('succeeds if a matching resource already exists', async () => {
      await helper.hooks.createHook('foo', 'bar', hookDef);
      await helper.hooks.createHook('foo', 'bar', hookDef);
    });

    test('fails if different resource already exists', async () => {
      await helper.hooks.createHook('foo', 'bar', hookDef);
      let newHookDef = _.cloneDeep(hookDef);
      newHookDef.expires = '11 days';
      await helper.hooks.createHook('foo', 'bar', newHookDef).then(
          () => { throw new Error('Expected an error'); },
          (err) => { debug('Got expected error: %s', err); });
    });

    test('creates associated group', async () => {
      await helper.hooks.createHook('baz', 'qux', hookDef);
      var r1 = await helper.hooks.listHookGroups();
      assume(r1.groups.length).equals(1);
      assume(r1.groups).contains('baz');
    });

    test('without a schedule', async () => {
      await helper.hooks.createHook('foo', 'bar', hookDef);
      var r1 = await helper.hooks.getHookSchedule('foo', 'bar');
      assume(r1).deep.equals({schedule: []});
    });

    test('with a daily schedule', async () => {
      await helper.hooks.createHook('foo', 'bar', dailyHookDef);
      var r1 = await helper.hooks.getHookSchedule('foo', 'bar');
      assert(new Date(r1.nextScheduledDate) > new Date());
    });

    test('fails with invalid schedule', async () => {
      await helper.hooks.createHook('foo', 'bar', invalidHookDef).then(
          () => { throw new Error('Expected an error'); },
          (err) => { assume(err.statusCode).equals(400); });
    });
  });

  suite('updateHook', function() {
    test('updates a hook', async () => {
      var input = require('./test_definition');
      var r1 = await helper.hooks.createHook('foo', 'bar', input);

      input.metadata.owner = 'test@test.org';
      var r2 = await helper.hooks.updateHook('foo', 'bar', input);
      assume(r2.metadata).deep.not.equals(r1.metadata);
      assume(r2.task).deep.equals(r1.task);
    });

    test('fails if resource doesn\'t exist', async () => {
      await helper.hooks.updateHook('foo', 'bar', hookDef).then(
          () => { throw new Error('Expected an error'); },
          (err) => { assume(err.statusCode).equals(404); });
    });

    test('fails if new schedule is invalid', async () => {
      var input = require('./test_definition');
      await helper.hooks.createHook('foo', 'bar', input);

      await helper.hooks.updateHook('foo', 'bar', invalidHookDef).then(
          () => { throw new Error('Expected an error'); },
          (err) => { assume(err.statusCode).equals(400); });
    });
  });

  suite('removeHook', function() {
    test('removes a hook', async () => {
      await helper.hooks.createHook('foo', 'bar', hookDef);
      await helper.hooks.removeHook('foo', 'bar');
      await helper.hooks.hook('foo', 'bar').then(
        () => { throw new Error('The resource should not exist'); },
        (err) => { assume(err.statusCode).equals(404); });
    });

    test('removed empty groups', async () => {
      await helper.hooks.createHook('foo', 'bar', hookDef);
      var r1 = await helper.hooks.listHooks('foo');
      assume(r1.hooks.length).equals(1);

      await helper.hooks.removeHook('foo', 'bar');
      await helper.hooks.listHooks('foo').then(
        () => { throw new Error('The group should not exist'); },
        (err) => { assume(err.statusCode).equals(404); });
    });
  });

  suite('listHookGroups', function() {
    test('returns valid groups', async () => {
      var input = ['foo', 'bar', 'baz', 'qux'];
      for (let i =0; i < input.length; i++) {
        await helper.hooks.createHook(input[i], 'testHook1', hookDef);
        await helper.hooks.createHook(input[i], 'testHook2', hookDef);
      }
      var r1 = await helper.hooks.listHookGroups();
      input.sort();
      r1.groups.sort();
      assume(r1.groups).eql(input);
    });
  });

  suite('listHooks', function() {
    test('lists hooks in the given group only', async () => {
      var input = ['foo', 'bar', 'baz', 'qux'];
      for (let i =0; i < input.length; i++) {
        await helper.hooks.createHook('grp1', input[i], hookDef);
        await helper.hooks.createHook('grp2', input[i], hookDef);
      }
      var r1 = await helper.hooks.listHooks('grp1');
      var got = r1.hooks.map((h) => { return h.hookId; });
      input.sort();
      got.sort();
      assume(got).eql(input);
    });
  });

  suite('hook', function() {
    test('returns a hook', async () => {
      await helper.hooks.createHook('gp', 'hk', hookDef);
      var r1 = await helper.hooks.hook('gp', 'hk');
      assume(r1.metadata.name).equals('Unit testing hook');
    });

    test('fails if no hook exists', async () => {
      await helper.hooks.hook('foo', 'bar').then(
          () => { throw new Error('The resource should not exist'); },
          (err) => { assume(err.statusCode).equals(404); });
    });
  });

  suite('getTriggerToken', function() {

    test('returns the same token', async () => {
      await helper.hooks.createHook('foo', 'bar', hookDef);
      var r1 = await helper.hooks.getTriggerToken('foo', 'bar');
      var r2 = await helper.hooks.getTriggerToken('foo', 'bar');
      assume(r1).deep.equals(r2);
    });

    test('error on requesting token for undefined hook', async () => {
      await helper.hooks.getTriggerToken('foo', 'bar').then(
          () => { throw new Error('This operation should have failed!'); },
          (err) => { assume(err.statusCode).equals(404); });
    });
  });

  suite('getHookSchedule', function() {
    test('returns {schedule: []} for a non-scheduled task', async () => {
      await helper.hooks.createHook('foo', 'bar', hookDef);
      var r1 = await helper.hooks.getHookSchedule('foo', 'bar');
      assume(r1).deep.equals({schedule: []});
    });

    test('returns the schedule for a -scheduled task', async () => {
      await helper.hooks.createHook('foo', 'bar', dailyHookDef);
      var r1 = await helper.hooks.getHookSchedule('foo', 'bar');
      assume(r1).contains('nextScheduledDate');
      assume(r1.schedule).deep.eql(['0 0 3 * * *']);
    });

    test('fails if no hook exists', async () => {
      await helper.hooks.getHookSchedule('foo', 'bar').then(
          () => { throw new Error('The resource should not exist'); },
          (err) => { assume(err.statusCode).equals(404); });
    });
  });

  suite('getHookStatus', function() {
    test('returns "no-fire" for a non-scheduled, non-fired task', async () => {
      await helper.hooks.createHook('foo', 'bar', hookDef);
      var r1 = await helper.hooks.getHookStatus('foo', 'bar');
      assume(r1).deep.equals({lastFire: {result: 'no-fire'}});
    });

    test('returns the next date for a scheduled task', async () => {
      await helper.hooks.createHook('foo', 'bar', dailyHookDef);
      var r1 = await helper.hooks.getHookStatus('foo', 'bar');
      assume(r1).contains('nextScheduledDate');
    });

    test('returns the last run status for a hook that has fired', async () => {
      await helper.hooks.createHook('foo', 'bar', dailyHookDef);
      let now = new Date();
      await setHookLastFire('foo', 'bar', {result: 'success', taskId: 'E5SBRfo-RfOIxh0V4187Qg', time: now});
      var r1 = await helper.hooks.getHookStatus('foo', 'bar');
      assume(r1).contains('lastFire');
      assume(r1.lastFire.result).is.equal('success');
      assume(r1.lastFire.taskId).is.equal('E5SBRfo-RfOIxh0V4187Qg');
      assume(r1.lastFire.time).is.equal(now.toJSON());
    });

    test('returns the last run status for triggerHook', async() => {
      await helper.hooks.createHook('foo', 'bar', hookDef);
      await helper.hooks.triggerHook('foo', 'bar', {a: 'payload'});
      var r1 = await helper.hooks.getHookStatus('foo', 'bar');
      assume(r1).contains('lastFire');
      assume(r1.lastFire.result).is.equal('success');
    });

    test('fails if no hook exists', async () => {
      await helper.hooks.getHookStatus('foo', 'bar').then(
          () => { throw new Error('The resource should not exist'); },
          (err) => { assume(err.statusCode).equals(404); });
    });
  });

  suite('triggerHook', function() {
    test('should launch task with the given payload', async () => {
      await helper.hooks.createHook('foo', 'bar', hookDef);
      await helper.hooks.triggerHook('foo', 'bar', {a: 'payload'});
      assume(helper.creator.fireCalls).deep.equals([{
        hookGroupId: 'foo',
        hookId: 'bar',
        payload: {a: 'payload'},
        options: {},
      }]);
    });

    test('fails when creating the task fails', async () => {
      await helper.hooks.createHook('foo', 'bar', hookDef);
      helper.creator.shouldFail = true; // firing the hook should fail..
      helper.scopes('hooks:trigger-hook:foo/bar');
      try {
        await helper.hooks.triggerHook('foo', 'bar', {a: 'payload'});
      } catch (err) {
        assume(err.statusCode).equals(400);
        assume(err.body.error).exists();
        return;
      }
      throw new Error('should have thrown an exception');
    });

    test('fails if no hook exists', async () => {
      await helper.hooks.triggerHook('foo', 'bar', {a: 'payload'}).then(
          () => { throw new Error('The resource should not exist'); },
          (err) => { assume(err.statusCode).equals(404); });
    });
  });

  suite('resetTriggerToken', function() {

    test('creates a new token', async () => {
      await helper.hooks.createHook('foo', 'bar', hookDef);
      var r1 = await helper.hooks.getTriggerToken('foo', 'bar');
      var r2 = await helper.hooks.resetTriggerToken('foo', 'bar');
      assume(r1).deep.not.equals(r2);
      var r3 = await helper.hooks.getTriggerToken('foo', 'bar');
      assume(r2).deep.equals(r2);
    });

    test('fails for undefined hook',  async () => {
      await helper.hooks.resetTriggerToken('foo', 'bar').then(
        () => { throw new Error('The resource should not exist'); },
        (err) => { assume(err.statusCode).equals(404); });

    });
  });

  suite('triggerHookWithToken', function() {

    test('successfully triggers task with the given payload', async () => {
      await helper.hooks.createHook('foo', 'bar', hookDef);
      var res = await helper.hooks.getTriggerToken('foo', 'bar');
      await helper.hooks.triggerHookWithToken('foo', 'bar', res.token, {a: "payload"});
      assume(helper.creator.fireCalls).deep.equals([{
        hookGroupId: 'foo',
        hookId: 'bar',
        payload: {a: 'payload'},
        options: {},
      }]);
    });

    test('should fail with invalid token', async () => {
      let payload = {};
      await helper.hooks.createHook('foo', 'bar', hookDef);
      await helper.hooks.triggerHookWithToken('foo', 'bar', 'invalidtoken', payload).then(
          () => { throw new Error('This operation should have failed!'); },
          (err) => { assume(err.statusCode).equals(401); });
    });

    test('fails with invalidated token', async () => {
      let payload = {};
      await helper.hooks.createHook('foo', 'bar', hookDef);
      let res = await helper.hooks.getTriggerToken('foo', 'bar');

      await helper.hooks.resetTriggerToken('foo', 'bar');
      await helper.hooks.triggerHookWithToken('foo', 'bar', res.token, payload).then(
          () => { throw new Error('This operation should have failed!'); },
          (err) => { assume(err.statusCode).equals(401); });
    });

    test('fails with undefined hook', async () => {
      let payload = {};
      await helper.hooks.triggerHookWithToken('foo', 'bar', 'zzz', payload).then(
          () => { throw new Error('This operation should have failed!'); },
          (err) => { assume(err.statusCode).equals(404); });
    });

    test('trigger task after resetting the trigger token', async () => {
      let payload = {a: 'payload'};
      await helper.hooks.createHook('foo', 'bar', hookDef);
      let r1 = await helper.hooks.getTriggerToken('foo', 'bar');
      var r2 = await helper.hooks.resetTriggerToken('foo', 'bar');
      var r3 = await helper.hooks.getTriggerToken('foo', 'bar');

      assume(r1).deep.not.equals(r2);
      assume(r2).deep.equals(r3);
      await helper.hooks.triggerHookWithToken('foo', 'bar', r3.token, payload);
      assume(helper.creator.fireCalls).deep.equals([{
        hookGroupId: 'foo',
        hookId: 'bar',
        payload: payload,
        options: {},
      }]);
    });
  });
});
