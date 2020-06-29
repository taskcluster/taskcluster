const _ = require('lodash');
const assert = require('assert');
const assume = require('assume');
const debug = require('debug')('test:api:createhook');
const taskcluster = require('taskcluster-client');
const helper = require('./helper');
const testing = require('taskcluster-lib-testing');

helper.secrets.mockSuite(testing.suiteName(), ['db'], function(mock, skipping) {
  helper.withDb(mock, skipping);
  helper.withEntities(mock, skipping);
  helper.withTaskCreator(mock, skipping);
  helper.withPulse(mock, skipping);
  helper.withServer(mock, skipping);
  helper.resetTables(mock, skipping);

  // Use the same hook definition for everything
  const hookDef = _.cloneDeep(require('./test_definition'));
  const hookWithTriggerSchema = _.defaults({
    triggerSchema: {
      type: 'object',
      properties: {
        location: {
          type: 'string',
          default: 'Niskayuna, NY',
        },
        otherVariable: {
          type: 'number',
          default: '12',
        },
      },
      additionalProperties: true,
    },
    bindings: [],
  }, hookDef);

  const hookWithHookIds = {
    task: {
      provisionerId: 'no-provisioner',
      workerType: 'test-worker',
      schedulerId: 'my-scheduler',
      taskGroupId: 'dSlITZ4yQgmvxxAi4A8fHQ',
      scopes: [],
      payload: {},
      metadata: {
        name: 'Unit testing task',
        description: 'Task created during unit tests',
        owner: 'amiyaguchi@mozilla.com',
        source: 'http://github.com/',
      },
      expires: {$fromNow: '10 days'},
      deadline: {$fromNow: '3 days'},
      tags: {
        purpose: 'taskcluster-testing',
      },
    },
    hookId: 'bar',
    hookGroupId: 'foo',
    bindings: [],
    metadata: {
      name: 'Unit testing hook',
      description: 'Hook created during unit tests',
      owner: 'amiyaguchi@mozilla.com',
    },
  };

  const dailyHookDef = _.defaults({
    schedule: ['0 0 3 * * *'],
  }, hookWithTriggerSchema);
  const invalidHookDef = _.defaults({
    schedule: ['0 0 3 0 * *'],
  }, hookWithTriggerSchema);
  const unique = new Date().getTime().toString();
  const hookWithBindings = _.defaults({
    bindings: [{exchange: `exchange/test/${unique}`, routingKeyPattern: 'amongst.rockets.wizards'}],
  }, hookWithHookIds);
  const hookWithDeniedBindings = _.defaults({
    bindings: [{exchange: 'exchange/taskcluster-queue/v1/task-created', routingKeyPattern: 'amongst.new.rockets.and.wizards'}],
  }, hookWithHookIds);

  const appendLastFire = async ({hookGroupId, hookId, taskId, taskCreateTime, firedBy, result, error}) => {
    await helper.LastFire.create({
      hookGroupId,
      hookId,
      taskCreateTime,
      taskId,
      firedBy,
      result,
      error,
    });
  };

  const lastFire = {
    hookGroupId: 'test-listlastfires',
    hookId: 'bar',
    firedBy: 'triggerHook',
    taskId: taskcluster.slugid(),
    taskCreateTime: new Date(),
    result: 'success',
    error: '',
  };

  // work around https://github.com/mochajs/mocha/issues/2819.
  const subSkip = () => {
    suiteSetup(function() {
      if (skipping()) {
        this.skip();
      }
    });
  };

  suite('createHook', function() {
    subSkip();
    test("creates a hook", async () => {
      const r1 = await helper.hooks.createHook('foo', 'bar', hookWithTriggerSchema);
      const r2 = await helper.hooks.hook('foo', 'bar');
      assume(r1).deep.equals(r2);
      helper.assertPulseMessage('hook-created', ({payload}) =>
        _.isEqual({ hookGroupId: 'foo', hookId: 'bar' }, payload));
    });

    test('returns 500 when pulse publish fails', async () => {
      helper.onPulsePublish(() => {
        throw new Error('uhoh');
      });

      const apiClient = helper.hooks.use({retries: 0});
      await assert.rejects(
        () => apiClient.createHook('foo', 'bar', hookWithTriggerSchema),
        err => err.statusCode === 500);

      const monitor = await helper.load('monitor');
      assert.equal(
        monitor.manager.messages.filter(
          ({Type, Fields}) => Type === 'monitor.error' && Fields.message === 'uhoh',
        ).length,
        1);
      monitor.manager.reset();
    });

    test('creates a hook with slash in hookId', async () => {
      const r1 = await helper.hooks.createHook('foo', 'bar/slash', hookWithTriggerSchema);
      const r2 = await helper.hooks.hook('foo', 'bar/slash');
      assume(r1).deep.equals(r2);
      helper.assertPulseMessage('hook-created', ({payload}) =>
        _.isEqual({hookGroupId: 'foo', hookId: 'bar/slash'}, payload));
    });

    test('with invalid scopes', async () => {
      helper.scopes('hooks:modify-hook:wrong/scope');
      await helper.hooks.createHook('foo', 'bar', hookWithTriggerSchema).then(
        () => { throw new Error('Expected an authentication error'); },
        (err) => { debug('Got expected authentication error: %s', err); });
    });

    test('with invalid hookGroupId', async () => {
      await helper.hooks.createHook('foo/slash', 'bar', hookWithTriggerSchema).then(
        () => { throw new Error('Expected an error'); },
        (err) => {
          if (!/hookGroupId.*must match/.test(err)) {
            throw err;
          }
        });
    });

    test('with invalid hookId', async () => {
      await helper.hooks.createHook('foo', 'bar!!!', hookWithTriggerSchema).then(
        () => { throw new Error('Expected an error'); },
        (err) => {
          if (!/hookId.*must match/.test(err)) {
            throw err;
          }
        });
    });

    test('with invalid bindings (no routingKeyPattern)', async () => {
      const invalidHookDef = _.defaults({
        bindings: [{exchange: `exchanges/test-new/${unique}`}],
      }, hookDef);
      await helper.hooks.createHook('foo', 'bar', invalidHookDef).then(
        () => { throw new Error('Expected an error'); },
        (err) => {
          if (!/should have required property 'routingKeyPattern'/.test(err)) {
            throw err;
          }
        });
    });

    test('with invalid bindings (not an array)', async () => {
      const invalidHookDef = _.defaults({
        bindings: {exchange: `exchanges/test-new/${unique}`, routingKeyPattern: '#'},
      }, hookDef);
      await helper.hooks.createHook('foo', 'bar', invalidHookDef).then(
        () => { throw new Error('Expected an error'); },
        (err) => {
          if (!/should be array/.test(err)) {
            throw err;
          }
        });
    });

    test('succeeds if a matching resource already exists', async () => {
      await helper.hooks.createHook('foo', 'bar', hookWithTriggerSchema);
      await helper.hooks.createHook('foo', 'bar', hookWithTriggerSchema);
    });

    test('fails if different resource already exists', async () => {
      await helper.hooks.createHook('foo', 'bar', hookWithTriggerSchema);
      const newHookDef = _.cloneDeep(hookWithTriggerSchema);
      newHookDef.expires = '11 days';
      await helper.hooks.createHook('foo', 'bar', newHookDef).then(
        () => { throw new Error('Expected an error'); },
        (err) => { debug('Got expected error: %s', err); });
    });

    test('creates associated group', async () => {
      await helper.hooks.createHook('baz', 'qux', hookWithTriggerSchema);
      const r1 = await helper.hooks.listHookGroups();
      assume(r1.groups.length).equals(1);
      assume(r1.groups).contains('baz');
    });

    test('without a schedule', async () => {
      await helper.hooks.createHook('foo', 'bar', hookWithTriggerSchema);
      const r1 = await helper.hooks.getHookStatus('foo', 'bar');
      assume(r1.nextScheduledDate).to.equal(undefined);
    });

    test('with a daily schedule', async () => {
      await helper.hooks.createHook('foo', 'bar', dailyHookDef);
      const r1 = await helper.hooks.getHookStatus('foo', 'bar');
      assert(new Date(r1.nextScheduledDate) > new Date());
    });

    test('fails with invalid schedule', async () => {
      await helper.hooks.createHook('foo', 'bar', invalidHookDef).then(
        () => { throw new Error('Expected an error'); },
        (err) => { assume(err.statusCode).equals(400); });
    });

    test('succeeds if hookIds match', async () => {
      await helper.hooks.createHook('foo', 'bar', hookWithHookIds);
    });

    test('fails with invalid hookIds', async () => {
      await helper.hooks.createHook('bar', 'foo', hookWithHookIds).then(
        () => { throw new Error('Expected an error'); },
        (err) => { assume(err.statusCode).equals(400); });
    });
  });

  suite('updateHook', function() {
    subSkip();
    test('updates a hook', async () => {
      const inputWithTriggerSchema = _.defaults({
        triggerSchema: {
          type: 'object',
          properties: {
            location: {
              type: 'string',
              default: 'Niskayuna, NY',
            },
            otherVariable: {
              type: 'integer',
              default: '12',
            },
          },
          additionalProperties: false,
        },
      }, hookDef);
      const r1 = await helper.hooks.createHook('foo', 'bar', inputWithTriggerSchema);

      inputWithTriggerSchema.metadata.owner = 'test@test.org';
      const r2 = await helper.hooks.updateHook('foo', 'bar', inputWithTriggerSchema);
      assume(r2.metadata).deep.not.equals(r1.metadata);
      assume(r2.task).deep.equals(r1.task);
      helper.assertPulseMessage('hook-updated', ({payload}) =>
        _.isEqual({hookId: 'bar', hookGroupId: 'foo'}, payload));
    });

    test('fails if pulse publisher fails', async function() {
      await helper.hooks.createHook('foo', 'bar', hookWithTriggerSchema);
      helper.onPulsePublish(() => {
        throw new Error('uhoh');
      });

      const apiClient = helper.hooks.use({retries: 0});
      await assert.rejects(
        () => apiClient.updateHook('foo', 'bar', hookWithTriggerSchema),
        err => err.statusCode === 500);

      const monitor = await helper.load('monitor');
      assert.equal(
        monitor.manager.messages.filter(
          ({Type, Fields}) => Type === 'monitor.error' && Fields.message === 'uhoh',
        ).length,
        1);
      monitor.manager.reset();
    });

    test('fails if resource doesn\'t exist', async () => {
      await helper.hooks.updateHook('foo', 'bar', hookDef).then(
        () => { throw new Error('Expected an error'); },
        (err) => { assume(err.statusCode).equals(404); });
    });

    test('fails if new schedule is invalid', async () => {
      await helper.hooks.createHook('foo', 'bar', hookWithTriggerSchema);
      await helper.hooks.updateHook('foo', 'bar', invalidHookDef).then(
        () => { throw new Error('Expected an error'); },
        (err) => { assume(err.statusCode).equals(400); });
    });

    test('succeeds if hookIds match', async () => {
      await helper.hooks.createHook('foo', 'bar', hookWithTriggerSchema);
      await helper.hooks.updateHook('foo', 'bar', hookWithHookIds);
    });

    test('fails with invalid hookIds', async () => {
      await helper.hooks.createHook('foo', 'bar', hookWithTriggerSchema);
      await helper.hooks.updateHook('bar', 'foo', hookWithHookIds).then(
        () => { throw new Error('Expected an error'); },
        (err) => { assume(err.statusCode).equals(400); });
    });
  });

  suite('removeHook', function() {
    subSkip();
    test('removes a hook', async () => {
      await helper.hooks.createHook('foo', 'bar', hookWithTriggerSchema);
      await helper.hooks.removeHook('foo', 'bar');
      await helper.hooks.hook('foo', 'bar').then(
        () => { throw new Error('The resource in Hook Table should not exist'); },
        (err) => { assume(err.statusCode).equals(404); });
      helper.assertPulseMessage('hook-deleted', ({payload}) =>
        _.isEqual({hookGroupId: 'foo', hookId: 'bar'}, payload));
      await helper.hooks.listLastFires('foo', 'bar').then(
        () => { throw new Error('The resource in LastFires table should not exist'); },
        (err) => { assume(err.statusCode).equals(404); });
    });

    test('fails if pulse publisher fails', async function() {
      await helper.hooks.createHook('foo', 'bar', hookWithTriggerSchema);
      helper.onPulsePublish(() => {
        throw new Error('uhoh');
      });

      const apiClient = helper.hooks.use({retries: 0});
      await assert.rejects(
        () => apiClient.removeHook('foo', 'bar'),
        err => err.statusCode === 500);

      const monitor = await helper.load('monitor');
      assert.equal(
        monitor.manager.messages.filter(
          ({Type, Fields}) => Type === 'monitor.error' && Fields.message === 'uhoh',
        ).length,
        1);
      monitor.manager.reset();
    });

    test('remove all lastFires info of the hook ', async () => {
      await helper.hooks.createHook('foo', 'bar', hookWithTriggerSchema);
      await helper.hooks.triggerHook('foo', 'bar', {location: 'Belo Horizonte, MG',
        foo: 'triggerHook'});
      await helper.hooks.removeHook('foo', 'bar');
      await helper.hooks.listLastFires('foo', 'bar').then(
        () => { throw new Error('The resource in LastFires table should not exist'); },
        (err) => { assume(err.statusCode).equals(404); });
    });

    test('removed empty groups', async () => {
      await helper.hooks.createHook('foo', 'bar', hookWithTriggerSchema);
      const r1 = await helper.hooks.listHooks('foo');
      assume(r1.hooks.length).equals(1);

      await helper.hooks.removeHook('foo', 'bar');
      await helper.hooks.listHooks('foo').then(
        () => { throw new Error('The group should not exist'); },
        (err) => { assume(err.statusCode).equals(404); });
    });
  });

  suite('listHookGroups', function() {
    subSkip();
    test('returns valid groups', async () => {
      const input = ['foo', 'bar', 'baz', 'qux'];
      for (let i = 0; i < input.length; i++) {
        await helper.hooks.createHook(input[i], 'testHook1', hookWithTriggerSchema);
        await helper.hooks.createHook(input[i], 'testHook2', hookWithTriggerSchema);
      }
      const r1 = await helper.hooks.listHookGroups();
      input.sort();
      r1.groups.sort();
      assume(r1.groups).eql(input);
    });
  });

  suite('listHooks', function() {
    subSkip();
    test('lists hooks in the given group only', async () => {
      const input = ['foo', 'bar', 'baz', 'qux'];
      for (let i = 0; i < input.length; i++) {
        await helper.hooks.createHook('grp1', input[i], hookWithTriggerSchema);
        await helper.hooks.createHook('grp2', input[i], hookWithTriggerSchema);
      }
      const r1 = await helper.hooks.listHooks('grp1');
      const got = r1.hooks.map((h) => { return h.hookId; });
      input.sort();
      got.sort();
      assume(got).eql(input);
    });
  });

  suite('hook', function() {
    subSkip();
    test('returns a hook', async () => {
      await helper.hooks.createHook('gp', 'hk', hookWithTriggerSchema);
      const r1 = await helper.hooks.hook('gp', 'hk');
      assume(r1.metadata.name).equals('Unit testing hook');
    });

    test('fails if no hook exists', async () => {
      await helper.hooks.hook('foo', 'bar').then(
        () => { throw new Error('The resource should not exist'); },
        (err) => { assume(err.statusCode).equals(404); });
    });
  });

  suite('getTriggerToken', function() {
    subSkip();

    test('returns the same token', async () => {
      await helper.hooks.createHook('foo', 'bar', hookWithTriggerSchema);
      const r1 = await helper.hooks.getTriggerToken('foo', 'bar');
      const r2 = await helper.hooks.getTriggerToken('foo', 'bar');
      assume(r1).deep.equals(r2);
    });

    test('error on requesting token for undefined hook', async () => {
      await helper.hooks.getTriggerToken('foo', 'bar').then(
        () => { throw new Error('This operation should have failed!'); },
        (err) => { assume(err.statusCode).equals(404); });
    });
  });

  suite('getHookStatus', function() {
    subSkip();
    test('returns "no-fire" for a non-scheduled, non-fired task', async () => {
      await helper.hooks.createHook('foo', 'bar', hookWithTriggerSchema);
      const r1 = await helper.hooks.getHookStatus('foo', 'bar');
      assume(r1).deep.equals({lastFire: {result: 'no-fire'}});
    });

    test('returns the next date for a scheduled task', async () => {
      await helper.hooks.createHook('foo', 'bar', dailyHookDef);
      const r1 = await helper.hooks.getHookStatus('foo', 'bar');
      assume(r1).contains('nextScheduledDate');
    });

    test('returns the last run status for a hook that has fired', async () => {
      await helper.hooks.createHook('foo', 'bar', dailyHookDef);
      const now = new Date();
      await appendLastFire({
        hookGroupId: 'foo',
        hookId: 'bar',
        taskId: 'E5SBRfo-RfOIxh0V4187Qg',
        taskCreateTime: now,
        firedBy: 'triggerHook',
        result: 'success',
        error: '',
      });
      const r1 = await helper.hooks.getHookStatus('foo', 'bar');
      assume(r1).contains('lastFire');
      assume(r1.lastFire.result).is.equal('success');
      assume(r1.lastFire.taskId).is.equal('E5SBRfo-RfOIxh0V4187Qg');
      assume(r1.lastFire.time).is.equal(now.toJSON());
    });

    test('returns the last run status for a hook that failed with a JSON error', async () => {
      await helper.hooks.createHook('foo', 'bar', hookWithTriggerSchema);
      const now = new Date();
      await appendLastFire({
        hookGroupId: 'foo',
        hookId: 'bar',
        taskId: 'E5SBRfo-RfOIxh0V4187Qg',
        taskCreateTime: now,
        firedBy: 'triggerHook',
        result: 'error',
        error: '{"msg": "uhoh"}',
      });
      const r1 = await helper.hooks.getHookStatus('foo', 'bar');
      assume(r1).contains('lastFire');
      assume(r1.lastFire.result).is.equal('error');
      assume(r1.lastFire.error).is.deeply.equal({msg: "uhoh"});
    });

    test('returns the last run status for a hook that failed with a string error', async () => {
      await helper.hooks.createHook('foo', 'bar', hookWithTriggerSchema);
      const now = new Date();
      await appendLastFire({
        hookGroupId: 'foo',
        hookId: 'bar',
        taskId: 'E5SBRfo-RfOIxh0V4187Qg',
        taskCreateTime: now,
        firedBy: 'thing',
        result: 'error',
        error: 'uhoh',
      });
      const r1 = await helper.hooks.getHookStatus('foo', 'bar');
      assume(r1).contains('lastFire');
      assume(r1.lastFire.result).is.equal('error');
      assume(r1.lastFire.error).is.deeply.equal({message: "uhoh"});
    });

    test('fails if no hook exists', async () => {
      await helper.hooks.getHookStatus('foo', 'bar').then(
        () => { throw new Error('The resource should not exist'); },
        (err) => { assume(err.statusCode).equals(404); });
    });
  });

  suite('triggerHook', function() {
    subSkip();
    test('should launch task with the given payload', async () => {
      await helper.hooks.createHook('foo', 'bar', hookWithTriggerSchema);
      await helper.hooks.triggerHook('foo', 'bar', {location: 'Belo Horizonte, MG',
        foo: 'triggerHook'});
      assume(helper.creator.fireCalls).deep.equals([{
        hookGroupId: 'foo',
        hookId: 'bar',
        context: {firedBy: 'triggerHook', clientId: 'test-client', payload: {location: 'Belo Horizonte, MG', foo: 'triggerHook'}},
        options: {},
      }]);
    });

    test('returns an empty object when the hook does not create a task', async () => {
      await helper.hooks.createHook('foo', 'bar',
        Object.assign({}, hookWithTriggerSchema, {task: {$if: 'false', then: true}}));
      helper.creator.shouldNotProduceTask = true;
      const res = await helper.hooks.triggerHook('foo', 'bar', {});
      assume(res).deep.equals({});
    });

    test('fails when creating the task fails', async () => {
      await helper.hooks.createHook('foo', 'bar', hookWithTriggerSchema);
      helper.creator.shouldFail = { // firing the hook should fail..
        statusCode: 499,
        code: 'uhoh',
        body: {message: 'uhoh'},
      };
      helper.scopes('hooks:trigger-hook:foo/bar');
      try {
        await helper.hooks.triggerHook('foo', 'bar', {bar: {location: 'Belo Horizonte, MG'},
          foo: 'triggerHook'});
      } catch (err) {
        assume(err.statusCode).equals(400);
        assume(err.body.message).exists();
        return;
      }
      throw new Error('should have thrown an exception');
    });

    test('fails with a useful message when triggering fails to call a TC API', async () => {
      await helper.hooks.createHook('foo', 'bar', hookWithTriggerSchema);
      helper.creator.shouldFail = {
        statusCode: 413,
        code: 'InputTooLarge',
        body: {
          code: 'InputTooLarge',
          message: 'too much data',
          requestInfo: {
            method: 'makeMeATask',
          },
        },
      };
      helper.scopes('hooks:trigger-hook:foo/bar');
      try {
        await helper.hooks.triggerHook('foo', 'bar', {});
      } catch (err) {
        assume(err.statusCode).equals(400);
        assume(err.body.message).match(/While calling makeMeATask: InputTooLarge/);
        assume(err.body.message).match(/too much data/);
        return;
      }
      throw new Error('should have thrown an exception');
    });

    test('fails with a useful message when createTask says InsufficientScopes', async () => {
      await helper.hooks.createHook('foo', 'bar', hookWithTriggerSchema);
      helper.creator.shouldFail = {
        statusCode: 403,
        code: 'InsufficientScopes',
        body: {
          code: 'InsufficientScopes',
          message: 'not enough scopez',
          requestInfo: {
            method: 'createTask',
          },
        },
      };
      helper.scopes('hooks:trigger-hook:foo/bar');
      try {
        await helper.hooks.triggerHook('foo', 'bar', {});
      } catch (err) {
        assume(err.statusCode).equals(403);
        assume(err.code).equals('InsufficientScopes');
        assume(err.body.code).equals('InsufficientScopes');
        assume(err.body.message).match(
          /The role `hook-id:foo\/bar` does not have sufficient scopes to create the task:/);
        assume(err.body.message).match(/not enough scopez/);
        return;
      }
      throw new Error('should have thrown an exception');
    });

    test('fails if no hook exists', async () => {
      await helper.hooks.triggerHook('foo', 'bar', {bar: {location: 'Belo Horizonte, MG'},
        foo: 'triggerHook'}).then(
        () => { throw new Error('The resource should not exist'); },
        (err) => { assume(err.statusCode).equals(404); });
    });
  });

  suite('schemaTests', function() {
    subSkip();

    test('checking schema validation', async () => {
      await helper.hooks.createHook('foo', 'bar', hookWithTriggerSchema);
      await helper.hooks.triggerHook('foo', 'bar', {location: 28}).then(
        () => { throw new Error('Expected an error'); },
        (err) => { debug('Got expected error: %s', err); });
    });

    test('checking more than one schema validation error', async () => {
      await helper.hooks.createHook('foo', 'bar', hookWithTriggerSchema);
      await helper.hooks.triggerHook('foo', 'bar', {
        location: 28,
        otherVariable: 'twelve',
        foo: 'triggerHook',
      }).then(() => { throw new Error('Expected an error'); },
        (err) => { debug('Got expected error: %s', err); });
    });

    test('handle an invalid schema - createHook', async () => {
      const nHookDef = _.defaults({
        triggerSchema: {
          type: 'beer',
          properties: {
            location: {
              type: 'fruit',
              default: 'Niskayuna, NY',
            },
            otherVariable: {
              type: 'number',
              default: '12',
            },
          },
          additionalProperties: true,
        },
      }, hookDef);
      await helper.hooks.createHook('foo', 'bar', nHookDef).then(
        () => { throw new Error('Expected an error'); },
        (err) => {
          debug('Got expected error: %s', err);
          assert(/should be/.test(err.message));
        });
    });

    test('handle an invalid schema - updateHook', async () => {
      const nHookDef = _.defaults({
        triggerSchema: {
          type: 'beer',
          properties: {
            location: {
              type: 'fruit',
              default: 'Niskayuna, NY',
            },
            otherVariable: {
              type: 'number',
              default: '12',
            },
          },
          additionalProperties: true,
        },
      }, hookDef);
      await helper.hooks.createHook('foo', 'bar', hookWithTriggerSchema);
      await helper.hooks.updateHook('foo', 'bar', nHookDef).then(
        () => { throw new Error('Expected an error'); },
        (err) => {
          debug('Got expected error: %s', err);
          assert(/should be/.test(err.message));
        });
    });
  });

  suite('resetTriggerToken', function() {
    subSkip();
    test('creates a new token', async () => {
      await helper.hooks.createHook('foo', 'bar', hookWithTriggerSchema);
      const r1 = await helper.hooks.getTriggerToken('foo', 'bar');
      const r2 = await helper.hooks.resetTriggerToken('foo', 'bar');
      assume(r1).deep.not.equals(r2);
      const r3 = await helper.hooks.getTriggerToken('foo', 'bar');
      assume(r2).deep.equals(r3);
    });

    test('fails for undefined hook', async () => {
      await helper.hooks.resetTriggerToken('foo', 'bar').then(
        () => { throw new Error('The resource should not exist'); },
        (err) => { assume(err.statusCode).equals(404); });

    });
  });

  suite('triggerHookWithToken', function() {
    subSkip();
    test('successfully triggers task with the given payload', async () => {
      await helper.hooks.createHook('foo', 'bar', hookWithTriggerSchema);
      const res = await helper.hooks.getTriggerToken('foo', 'bar');
      await helper.hooks.triggerHookWithToken('foo', 'bar', res.token, {location: 'New Zealand'});
      assume(helper.creator.fireCalls).deep.equals([{
        hookGroupId: 'foo',
        hookId: 'bar',
        context: {firedBy: 'triggerHookWithToken', payload: {location: 'New Zealand'}},
        options: {},
      }]);
    });

    test('should fail with invalid token', async () => {
      const payload = {};
      await helper.hooks.createHook('foo', 'bar', hookWithTriggerSchema);
      await helper.hooks.triggerHookWithToken('foo', 'bar', 'invalidtoken', payload).then(
        () => { throw new Error('This operation should have failed!'); },
        (err) => { assume(err.statusCode).equals(401); });
    });

    test('fails with invalidated token', async () => {
      const payload = {};
      await helper.hooks.createHook('foo', 'bar', hookWithTriggerSchema);
      const res = await helper.hooks.getTriggerToken('foo', 'bar');

      await helper.hooks.resetTriggerToken('foo', 'bar');
      await helper.hooks.triggerHookWithToken('foo', 'bar', res.token, payload).then(
        () => { throw new Error('This operation should have failed!'); },
        (err) => { assume(err.statusCode).equals(401); });
    });

    test('fails with undefined hook', async () => {
      const payload = {};
      await helper.hooks.triggerHookWithToken('foo', 'bar', 'zzz', payload).then(
        () => { throw new Error('This operation should have failed!'); },
        (err) => { assume(err.statusCode).equals(404); });
    });

    test('trigger task after resetting the trigger token', async () => {
      const payload = {a: 'payload'};
      await helper.hooks.createHook('foo', 'bar', hookWithTriggerSchema);
      const r1 = await helper.hooks.getTriggerToken('foo', 'bar');
      const r2 = await helper.hooks.resetTriggerToken('foo', 'bar');
      const r3 = await helper.hooks.getTriggerToken('foo', 'bar');

      assume(r1).deep.not.equals(r2);
      assume(r2).deep.equals(r3);
      await helper.hooks.triggerHookWithToken('foo', 'bar', r3.token, payload);
      assume(helper.creator.fireCalls).deep.equals([{
        hookGroupId: 'foo',
        hookId: 'bar',
        context: {firedBy: 'triggerHookWithToken', payload},
        options: {},
      }]);
    });
  });

  suite('listLastFires', function() {
    subSkip();
    let creator = null;
    suiteSetup(async function() {
      if (skipping()) {
        this.skip();
      }

      helper.load.remove('taskcreator');
      creator = await helper.load('taskcreator');
      if (mock) {
        creator.fakeCreate = true;
      }
    });

    test('lists lastfires for a given hookGroupId and hookId', async () => {
      const taskIds = [];
      taskIds.push(lastFire.taskId);
      await appendLastFire(lastFire);
      for (let i = 1;i <= 2;i++) {
        taskIds.push(taskcluster.slugid());
        await appendLastFire({...lastFire,
          taskId: taskIds[i],
          taskCreateTime: new Date(),
        });
      }
      const {lastFires} = await helper.hooks.listLastFires(lastFire.hookGroupId, lastFire.hookId);
      const dataTaskIds = lastFires.map(lastFire => lastFire.taskId);
      taskIds.sort();
      dataTaskIds.sort();
      assume(taskIds).eql(dataTaskIds);
    });
  });

  suite('pulseHooks', function() {
    subSkip();
    test('createing a hook sends a pulse message', async () => {
      const r1 = await helper.hooks.createHook('foo', 'bar', hookWithBindings);
      const r2 = await helper.hooks.hook('foo', 'bar');
      assume(r1).deep.equals(r2);
      helper.assertPulseMessage('hook-created', ({payload}) =>
        _.isEqual({hookGroupId: 'foo', hookId: 'bar'}, payload));
    });

    test('hook-created message reconciles consumers', async () => {
      const listener = await helper.load('listeners');
      await helper.hooks.createHook('foo', 'bar', hookWithBindings);
      let reconciledConsumers = false;
      listener.reconcileConsumers = async () => reconciledConsumers = true;
      await helper.fakePulseMessage({
        payload: {
          hookId: 'bar',
          hookGroupId: 'foo',
        },
        exchange: 'exchange/taskcluster-hooks/v1/hook-created',
        routingKey: '-',
      });
      assert(reconciledConsumers);
    });

    test('creating a hook with denied exchanges fails', async () => {
      await helper.hooks.createHook('foo', 'bar', hookWithDeniedBindings).then(
        () => { throw new Error('Expected an error'); },
        (err) => { assume(err.body.message).match(/exchanges below have been denied access to hooks/); });
    });
    test('updating a hook with new denied exchanges fails', async () => {
      await helper.hooks.createHook('foo', 'bar', hookWithBindings);
      await helper.hooks.updateHook('foo', 'bar', hookWithDeniedBindings).then(
        () => { throw new Error('Expected an error'); },
        (err) => { assume(err.body.message).match(/exchanges below have been denied access to hooks/); });
    });
  });
});
