const assert = require('assert');
const assume = require('assume');
const taskcluster = require('taskcluster-client');
const sinon = require('sinon');
const helper = require('./helper');

helper.secrets.mockSuite('listeners_test.js', ['taskcluster'], function(mock, skipping) {
  helper.withHook(mock, skipping);
  helper.withQueues(mock, skipping);
  helper.withTaskCreator(mock, skipping);
  helper.withPulse(mock, skipping);

  const hookGroupId = 't';
  const hookId = 'h';

  const makeHookEntities = async (...hooks) => {
    for (let {hookId, bindings} of hooks) {
      await helper.Hook.create({
        hookGroupId,
        hookId,
        metadata: {},
        task: {},
        bindings,
        schedule: [],
        triggerToken: taskcluster.slugid(),
        lastFire: {},
        nextTaskId: taskcluster.slugid(),
        nextScheduledDate: taskcluster.fromNow('1 day'),
        triggerSchema: {},
      });
    }
  };

  const deleteHookEntity = async (hookId) => {
    const hook = await helper.Hook.load({hookGroupId, hookId});
    await hook.remove();
  };

  const makeQueueEntities = async (...queues) => {
    for (let {hookId, bindings} of queues) {
      const queueName = `${hookGroupId}/${hookId}`;
      await helper.Queues.create({hookGroupId, hookId, queueName, bindings});
    }
  };

  const assertQueueEntities = async (...queues) => {
    const exp = queues.reduce(
      (acc, {hookId, bindings}) => Object.assign(acc, {[`${hookGroupId}/${hookId}`]: bindings}), {});
    const got = {};
    await helper.Queues.scan({}, {
      handler: ({hookId, bindings}) => got[`${hookGroupId}/${hookId}`] = bindings,
    });

    assert.deepEqual(got, exp);
  };

  const qn = (hookGroupId, hookId) => `${hookGroupId}/${hookId}`;

  suite('reconcileConsumers', function() {
    let hookListeners;
    let createdListeners;
    let createdQueues;

    suiteSetup(function() {
      if (skipping()) {
        this.skip();
      }
    });

    setup('load and mock HookListeners', async function() {
      hookListeners = await helper.load('listeners');

      createdListeners = new Set();
      createdQueues = new Map();
      hookListeners.createListener = sinon.fake(
        async queueName => {
          createdListeners.add(queueName);
          createdQueues.set(queueName, []);
        });
      hookListeners.removeListener = sinon.fake(
        async queueName => createdListeners.delete(queueName));
      hookListeners.deleteQueue = sinon.fake(
        async queueName => createdQueues.delete(queueName));
      hookListeners.syncBindings = sinon.fake(
        async (queueName, newBindings, oldBindings) => {
          createdQueues.set(queueName, newBindings);
        });
    });

    test('with no changes does nothing', async function() {
      await hookListeners.reconcileConsumers();

      sinon.assert.callCount(hookListeners.createListener, 0);
      sinon.assert.callCount(hookListeners.removeListener, 0);
      sinon.assert.callCount(hookListeners.deleteQueue, 0);
      sinon.assert.callCount(hookListeners.syncBindings, 0);
    });

    test('with a newly-minted hook creates listener, bindings', async function() {
      const bindings = [{exchange: 'e', routingKeyPattern: 'foo.#'}];

      await makeHookEntities({hookId, bindings});

      await hookListeners.reconcileConsumers();

      sinon.assert.calledOnce(hookListeners.createListener);
      sinon.assert.calledWith(hookListeners.createListener,
        hookGroupId, hookId, qn(hookGroupId, hookId));
      sinon.assert.callCount(hookListeners.removeListener, 0);
      sinon.assert.callCount(hookListeners.deleteQueue, 0);
      sinon.assert.calledOnce(hookListeners.syncBindings);
      sinon.assert.calledWith(hookListeners.syncBindings,
        qn(hookGroupId, hookId), bindings, []);

      await assertQueueEntities({hookId, bindings});
    });

    test('with bindings already in Queues', async function() {
      const bindings = [{exchange: 'e', routingKeyPattern: 'foo.#'}];

      await makeHookEntities({hookId, bindings});
      await makeQueueEntities({hookId, bindings});

      await hookListeners.reconcileConsumers();

      sinon.assert.calledOnce(hookListeners.createListener);
      sinon.assert.calledWith(hookListeners.createListener,
        hookGroupId, hookId, qn(hookGroupId, hookId));
      sinon.assert.callCount(hookListeners.removeListener, 0);
      sinon.assert.callCount(hookListeners.deleteQueue, 0);
      sinon.assert.calledOnce(hookListeners.syncBindings);
      sinon.assert.calledWith(hookListeners.syncBindings,
        qn(hookGroupId, hookId), bindings, bindings); // no change

      await assertQueueEntities({hookId, bindings});
    });

    test('with changed bindings', async function() {
      const bindings = [{exchange: 'e', routingKeyPattern: 'foo.#'}];
      const newBindings = [{exchange: 'e2', routingKeyPattern: '#'}];

      await makeHookEntities({hookId, bindings: newBindings});
      await makeQueueEntities({hookId, bindings});

      await hookListeners.reconcileConsumers();

      sinon.assert.calledOnce(hookListeners.createListener);
      sinon.assert.calledWith(hookListeners.createListener,
        hookGroupId, hookId, qn(hookGroupId, hookId));
      sinon.assert.callCount(hookListeners.removeListener, 0);
      sinon.assert.callCount(hookListeners.deleteQueue, 0);
      sinon.assert.calledOnce(hookListeners.syncBindings);
      sinon.assert.calledWith(hookListeners.syncBindings,
        qn(hookGroupId, hookId), newBindings, bindings);

      await assertQueueEntities({hookId, bindings: newBindings});
    });

    test('with deleted bindings and no listener', async function() {
      const bindings = [{exchange: 'e', routingKeyPattern: 'foo.#'}];
      const newBindings = [];

      await makeHookEntities({hookId, bindings: newBindings});
      await makeQueueEntities({hookId, bindings});

      await hookListeners.reconcileConsumers();

      sinon.assert.callCount(hookListeners.createListener, 0);
      sinon.assert.callCount(hookListeners.removeListener, 0);
      sinon.assert.callCount(hookListeners.deleteQueue, 1);
      sinon.assert.calledWith(hookListeners.deleteQueue, qn(hookGroupId, hookId));
      sinon.assert.callCount(hookListeners.syncBindings, 0);

      await assertQueueEntities();
    });

    test('with deleted hook and active listener', async function() {
      const bindings = [{exchange: 'e', routingKeyPattern: 'foo.#'}];

      await makeQueueEntities({hookId, bindings});
      hookListeners.listeners[qn(hookGroupId, hookId)] = true;

      await hookListeners.reconcileConsumers();

      sinon.assert.callCount(hookListeners.createListener, 0);
      sinon.assert.callCount(hookListeners.removeListener, 1);
      sinon.assert.calledWith(hookListeners.removeListener, qn(hookGroupId, hookId));
      sinon.assert.callCount(hookListeners.deleteQueue, 1);
      sinon.assert.calledWith(hookListeners.deleteQueue, qn(hookGroupId, hookId));
      sinon.assert.callCount(hookListeners.syncBindings, 0);

      await assertQueueEntities();
    });
  });

  suite('firing hooks', function() {
    suiteSetup(function() {
      if (skipping()) {
        this.skip();
      }
    });

    test('triggers hook with a pulse message', async () => {
      await makeHookEntities({hookId, bindings: [{exchange: 'e', routingKeyPattern: 'rkp'}]});
      await helper.Listener.reconcileConsumers();

      const listener = helper.Listener.listeners[qn(hookGroupId, hookId)];
      await listener.fakeMessage({payload: {location: 'Orlando'}, exchange: 'e'});
      assume(helper.creator.fireCalls).deep.equals([{
        hookGroupId,
        hookId,
        context: {firedBy: 'pulseMessage', payload: {location: 'Orlando'}},
        options: {},
      }]);
    });

    test('does nothing if the hook is gone', async () => {
      await makeHookEntities({hookId, bindings: [{exchange: 'e', routingKeyPattern: 'rkp'}]});
      await helper.Listener.reconcileConsumers();

      await deleteHookEntity(hookId);
      const listener = helper.Listener.listeners[qn(hookGroupId, hookId)];
      await listener.fakeMessage({payload: {location: 'Orlando'}, exchange: 'e'});
      assume(helper.creator.fireCalls).deep.equals([]);
    });

    test('does nothing if the hook is gone and reconciliation has occurred', async () => {
      await makeHookEntities({hookId, bindings: [{exchange: 'e', routingKeyPattern: 'rkp'}]});
      await helper.Listener.reconcileConsumers();

      await deleteHookEntity(hookId);
      await helper.Listener.reconcileConsumers();

      // listener should be gone now
      assume(helper.Listener.listeners).deep.equals({});
    });
  });
});
