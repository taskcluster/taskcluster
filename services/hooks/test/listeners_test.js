import assert from 'node:assert';
import assume from 'assume';
import taskcluster from '@taskcluster/client';
import sinon from 'sinon';
import helper from './helper.js';
import testing from '@taskcluster/lib-testing';
import { queueUtils } from '../src/utils.js';

helper.secrets.mockSuite(testing.suiteName(), [], (mock, skipping) => {
  helper.withDb(mock, skipping);
  helper.withTaskCreator(skipping);
  helper.withPulse(skipping);
  helper.resetTables();

  const hookGroupId = 't';
  const hookId = 'h';

  const makeHookEntities = async (...hooks) => {
    for (const { hookId, bindings, triggerSchema = {} } of hooks) {
      await helper.db.fns.create_hook(
        hookGroupId,
        hookId,
        {} /* metadata */,
        {} /* task */,
        JSON.stringify(bindings) /* bindings */,
        JSON.stringify([]) /* schedule */,
        helper.db.encrypt({ value: Buffer.from(taskcluster.slugid(), 'utf8') }) /* encrypted_trigger_token */,
        helper.db.encrypt({ value: Buffer.from(taskcluster.slugid(), 'utf8') }) /* encrypted_next_task_id */,
        taskcluster.fromNow('1 day') /* next_scheduled_date */,
        triggerSchema /* trigger_schema */
      );
    }
  };

  const deleteHookEntity = async hookId => {
    // const hook = await helper.Hook.load({hookGroupId, hookId});
    // await hook.remove();
    await helper.db.fns.delete_hook(hookGroupId, hookId);
  };

  const makeQueueEntities = async (...queues) => {
    for (const { hookId, bindings } of queues) {
      const queueName = `${hookGroupId}/${hookId}`;
      await helper.db.fns.create_hooks_queue(hookGroupId, hookId, queueName, JSON.stringify(bindings));
    }
  };

  const assertQueueEntities = async (...queues) => {
    const exp = queues.reduce(
      (acc, { hookId, bindings }) => Object.assign(acc, { [`${hookGroupId}/${hookId}`]: bindings }),
      {}
    );
    const got = {};

    const rows = await helper.db.fns.get_hooks_queues(null, null);
    const q = rows.map(queueUtils.fromDb);

    for (const queue of q) {
      got[`${hookGroupId}/${queue.hookId}`] = queue.bindings;
    }

    assert.deepEqual(got, exp);
  };

  const qn = (hookGroupId, hookId) => `${hookGroupId}/${hookId}`;

  suite('syncBindings', () => {
    let hookListeners;
    let channels = [];

    suiteSetup(async function () {
      if (skipping()) {
        this.skip();
      }

      hookListeners = await helper.load('listeners');

      // syncBindings stubs itself out for fake clients, because fake clients don't
      // support withConnection.  We're faking withConnection and part of amqplib
      // here in ordre to stress-test this function without involving an AMQP server.
      //
      class Channel {
        constructor() {
          this.id = channels.length;
          this.bindings = [];
          this.unbindings = [];
          this.failed = false;
          channels.push(this);
        }

        async bindQueue(queueName, exchange, routingKeyPattern) {
          assert(!this.failed);
          if (exchange === 'nonexistent') {
            this.failed = true;
            const err = new Error('no such exchange');
            err.code = 404;
            throw err;
          }
          if (exchange === 'explode') {
            this.failed = true;
            const err = new Error('boom');
            err.code = 500;
            throw err;
          }
          this.bindings.push({ queueName, exchange, routingKeyPattern });
        }

        async unbindQueue(queueName, exchange, routingKeyPattern) {
          assert(!this.failed);
          this.unbindings.push({ queueName, exchange, routingKeyPattern });
        }
      }

      hookListeners.client = {
        fullObjectName: hookListeners.client.fullObjectName,
        isFakeClient: false,
        withChannel: async fn => {
          await fn(new Channel());
        },
      };
    });

    setup(() => {
      channels = [];
    });

    suiteTeardown(function () {
      if (skipping()) {
        this.skip();
      }

      helper.load.remove('listeners');
    });

    const binding = (exchange, routingKeyPattern) => ({ exchange, routingKeyPattern });
    const namedbinding = (name, exchange, routingKeyPattern) => ({
      queueName: `queue/undefined/${name}`,
      exchange,
      routingKeyPattern,
    });

    test('add bindings', async () => {
      const res = await hookListeners.syncBindings(
        'qn',
        [binding('e', 'r1'), binding('e', 'r2')],
        [binding('e', 'r2')]
      );

      assert.deepEqual(new Set(res), new Set([binding('e', 'r1'), binding('e', 'r2')]));

      assert.equal(channels.length, 1);
      assert.deepEqual(channels[0].bindings, [namedbinding('qn', 'e', 'r1')]);
      assert.deepEqual(channels[0].unbindings, []);
    });

    test('add bindings with nonexistent exchange', async () => {
      const res = await hookListeners.syncBindings(
        'qn',
        [binding('e', 'r1'), binding('nonexistent', 'xx'), binding('e', 'r2')],
        []
      );

      assert.deepEqual(new Set(res), new Set([binding('e', 'r1'), binding('e', 'r2')]));

      assert.equal(channels.length, 3);
      assert.deepEqual(channels[0].bindings, [namedbinding('qn', 'e', 'r1')]);
      assert.deepEqual(channels[0].unbindings, []);
      assert.deepEqual(channels[1].failed, true);
      assert.deepEqual(channels[2].bindings, [namedbinding('qn', 'e', 'r2')]);
      assert.deepEqual(channels[2].unbindings, []);
    });

    test('add bindings with error', async () => {
      assert.rejects(async () => {
        await hookListeners.syncBindings('qn', [binding('explode', 'xx')], []);
      }, /boom/);
    });

    test('remove bindings', async () => {
      const res = await hookListeners.syncBindings(
        'qn',
        [binding('e', 'r2')],
        [binding('e', 'r1'), binding('e', 'r2')]
      );

      assert.deepEqual(res, [binding('e', 'r2')]);

      assert.equal(channels.length, 1);
      assert.deepEqual(channels[0].bindings, []);
      assert.deepEqual(channels[0].unbindings, [namedbinding('qn', 'e', 'r1')]);
    });

    test('no change', async () => {
      const res = await hookListeners.syncBindings(
        'qn',
        [binding('e', 'r1'), binding('e', 'r2')],
        [binding('e', 'r1'), binding('e', 'r2')]
      );

      assert.deepEqual(new Set(res), new Set([binding('e', 'r1'), binding('e', 'r2')]));

      assert.equal(channels.length, 0);
    });
  });

  suite('reconcileConsumers', () => {
    let hookListeners;
    let createdListeners;
    let createdQueues;

    setup('load and mock HookListeners', async () => {
      hookListeners = await helper.load('listeners');

      createdListeners = new Set();
      createdQueues = new Map();
      hookListeners.createListener = sinon.fake(async queueName => {
        createdListeners.add(queueName);
        createdQueues.set(queueName, []);
      });
      hookListeners.removeListener = sinon.fake(async queueName => createdListeners.delete(queueName));
      hookListeners.deleteQueue = sinon.fake(async queueName => createdQueues.delete(queueName));
      hookListeners.syncBindings = sinon.fake(async (queueName, newBindings, _oldBindings) => {
        createdQueues.set(queueName, newBindings);
        return newBindings;
      });
    });

    test('with no changes does nothing', async () => {
      await hookListeners.reconcileConsumers();

      sinon.assert.callCount(hookListeners.createListener, 0);
      sinon.assert.callCount(hookListeners.removeListener, 0);
      sinon.assert.callCount(hookListeners.deleteQueue, 0);
      sinon.assert.callCount(hookListeners.syncBindings, 0);
    });

    test('with a newly-minted hook creates listener, bindings', async () => {
      const bindings = [{ exchange: 'e', routingKeyPattern: 'foo.#' }];

      await makeHookEntities({ hookId, bindings });

      await hookListeners.reconcileConsumers();

      sinon.assert.calledOnce(hookListeners.createListener);
      sinon.assert.calledWith(hookListeners.createListener, hookGroupId, hookId, qn(hookGroupId, hookId));
      sinon.assert.callCount(hookListeners.removeListener, 0);
      sinon.assert.callCount(hookListeners.deleteQueue, 0);
      sinon.assert.calledOnce(hookListeners.syncBindings);
      sinon.assert.calledWith(hookListeners.syncBindings, qn(hookGroupId, hookId), bindings, []);

      await assertQueueEntities({ hookId, bindings });
    });

    test('with bindings already in Queues', async () => {
      const bindings = [{ exchange: 'e', routingKeyPattern: 'foo.#' }];

      await makeHookEntities({ hookId, bindings });
      await makeQueueEntities({ hookId, bindings });

      await hookListeners.reconcileConsumers();

      sinon.assert.calledOnce(hookListeners.createListener);
      sinon.assert.calledWith(hookListeners.createListener, hookGroupId, hookId, qn(hookGroupId, hookId));
      sinon.assert.callCount(hookListeners.removeListener, 0);
      sinon.assert.callCount(hookListeners.deleteQueue, 0);
      sinon.assert.calledOnce(hookListeners.syncBindings);
      sinon.assert.calledWith(hookListeners.syncBindings, qn(hookGroupId, hookId), bindings, bindings); // no change

      await assertQueueEntities({ hookId, bindings });
    });

    test('with changed bindings', async () => {
      const bindings = [{ exchange: 'e', routingKeyPattern: 'foo.#' }];
      const newBindings = [{ exchange: 'e2', routingKeyPattern: '#' }];

      await makeHookEntities({ hookId, bindings: newBindings });
      await makeQueueEntities({ hookId, bindings });

      await hookListeners.reconcileConsumers();

      sinon.assert.calledOnce(hookListeners.createListener);
      sinon.assert.calledWith(hookListeners.createListener, hookGroupId, hookId, qn(hookGroupId, hookId));
      sinon.assert.callCount(hookListeners.removeListener, 0);
      sinon.assert.callCount(hookListeners.deleteQueue, 0);
      sinon.assert.calledOnce(hookListeners.syncBindings);
      sinon.assert.calledWith(hookListeners.syncBindings, qn(hookGroupId, hookId), newBindings, bindings);

      await assertQueueEntities({ hookId, bindings: newBindings });
    });

    test('with deleted bindings and no listener', async () => {
      const bindings = [{ exchange: 'e', routingKeyPattern: 'foo.#' }];
      const newBindings = [];

      await makeHookEntities({ hookId, bindings: newBindings });
      await makeQueueEntities({ hookId, bindings });

      await hookListeners.reconcileConsumers();

      sinon.assert.callCount(hookListeners.createListener, 0);
      sinon.assert.callCount(hookListeners.removeListener, 0);
      sinon.assert.callCount(hookListeners.deleteQueue, 1);
      sinon.assert.calledWith(hookListeners.deleteQueue, qn(hookGroupId, hookId));
      sinon.assert.callCount(hookListeners.syncBindings, 0);

      await assertQueueEntities();
    });

    test('with deleted hook and active listener', async () => {
      const bindings = [{ exchange: 'e', routingKeyPattern: 'foo.#' }];

      await makeQueueEntities({ hookId, bindings });
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

  suite('firing hooks', () => {
    let hookListeners;
    let monitor;

    suiteSetup(function () {
      if (skipping()) {
        this.skip();
      }
    });

    setup('load and mock HookListeners', async () => {
      // force-reload the listeners component for each test
      helper.load.remove('listeners');
      hookListeners = await helper.load('listeners');
      monitor = await helper.load('monitor');
      monitor.manager.reset();
    });

    teardown(async () => {
      // stop this test's consumers so they don't stay registered on the shared
      // fake pulse client and receive messages sent by later tests
      for (const listener of Object.values(hookListeners.listeners ?? {})) {
        await listener.stop();
      }
    });

    test('triggers hook with a pulse message', async () => {
      await makeHookEntities({ hookId, bindings: [{ exchange: 'e', routingKeyPattern: 'rkp' }] });
      await hookListeners.reconcileConsumers();

      await helper.fakePulseMessage({
        exchange: 'e',
        routingKey: 'rkp',
        routes: [],
        payload: { location: 'Orlando' },
      });

      assume(helper.creator.fireCalls).deep.equals([
        {
          hookGroupId,
          hookId,
          context: { firedBy: 'pulseMessage', payload: { location: 'Orlando' } },
          options: {},
        },
      ]);
    });

    test('discards pulse message when hook has the default triggerSchema', async () => {
      // Default is defined in ../schemas/v1/create-hook-request.yml#L36
      await makeHookEntities({
        hookId,
        bindings: [{ exchange: 'e', routingKeyPattern: 'rkp' }],
        triggerSchema: { type: 'object', additionalProperties: false },
      });
      await hookListeners.reconcileConsumers();

      await helper.fakePulseMessage({
        exchange: 'e',
        routingKey: 'rkp',
        routes: [],
        payload: { action: 'opened' },
      });

      assume(helper.creator.fireCalls).deep.equals([]);
      assert.equal(monitor.manager.messages.filter(({ Type }) => Type === 'hook-pulse-message-discarded').length, 1);
    });

    test('triggers hook with a pulse message matching triggerSchema', async () => {
      await makeHookEntities({
        hookId,
        bindings: [{ exchange: 'e', routingKeyPattern: 'rkp' }],
        triggerSchema: {
          type: 'object',
          properties: {
            action: {
              enum: ['opened'],
            },
          },
          required: ['action'],
          additionalProperties: true,
        },
      });
      await hookListeners.reconcileConsumers();

      await helper.fakePulseMessage({
        exchange: 'e',
        routingKey: 'rkp',
        routes: [],
        payload: { action: 'opened' },
      });

      assume(helper.creator.fireCalls).deep.equals([
        {
          hookGroupId,
          hookId,
          context: { firedBy: 'pulseMessage', payload: { action: 'opened' } },
          options: {},
        },
      ]);
      assert.equal(monitor.manager.messages.filter(({ Type }) => Type === 'hook-pulse-message-discarded').length, 0);
    });

    test('discards pulse messages failing triggerSchema', async () => {
      await makeHookEntities({
        hookId,
        bindings: [{ exchange: 'e', routingKeyPattern: 'rkp' }],
        triggerSchema: {
          type: 'object',
          properties: {
            action: {
              enum: ['opened'],
            },
          },
          required: ['action'],
          additionalProperties: true,
        },
      });
      await hookListeners.reconcileConsumers();

      for (let i = 0; i < 2; i++) {
        await helper.fakePulseMessage({
          exchange: 'e',
          routingKey: 'rkp',
          routes: [],
          payload: { action: 'closed' },
        });
      }

      assume(helper.creator.fireCalls).deep.equals([]);

      assert.equal(
        monitor.manager.messages.filter(
          ({ Type, Fields }) => Type === 'monitor.count' && Fields.key === 'fire.pulseMessage.triggerSchemaInvalid'
        ).length,
        2
      );

      const discardLogs = monitor.manager.messages.filter(({ Type }) => Type === 'hook-pulse-message-discarded');
      assert.equal(discardLogs.length, 1);
      assert.deepEqual(discardLogs[0].Fields, {
        v: 1,
        hookGroupId,
        hookId,
        exchange: 'e',
        routingKey: 'rkp',
        reason: 'triggerSchema',
        validationError: 'data/action must be equal to one of the allowed values',
        discardedCount: 1,
        message: 'Pulse message discarded because payload does not match hook triggerSchema',
      });
    });

    test('does nothing if the hook is gone', async () => {
      await makeHookEntities({ hookId, bindings: [{ exchange: 'e', routingKeyPattern: 'rkp' }] });
      await hookListeners.reconcileConsumers();

      await deleteHookEntity(hookId);

      await helper.fakePulseMessage({
        exchange: 'e',
        routingKey: 'rkp',
        routes: [],
        payload: { location: 'Orlando' },
      });
      assume(helper.creator.fireCalls).deep.equals([]);
    });

    test('does nothing if the hook is gone and reconciliation has occurred', async () => {
      await makeHookEntities({ hookId, bindings: [{ exchange: 'e', routingKeyPattern: 'rkp' }] });
      await hookListeners.reconcileConsumers();

      await deleteHookEntity(hookId);
      await hookListeners.reconcileConsumers();

      // listener should be gone now
      assume(hookListeners.listeners).deep.equals({});
    });
  });
});
