const assert = require('assert');
const debug = require('debug')('listeners');
const pulse = require('taskcluster-lib-pulse');
const _ = require('lodash');

/**
 * Create pulse client and consumers to trigger hooks with pulse messages
 *
 * options:
 * {
 *   Hook:               // Azure tables for hooks
 *   Queues:             // Azure tables for AMQP queues
 *   taskcreator:        // A TaskCreator instance
 *   client:            // A tc-lib-pulse client instance
 * }
 */

class HookListeners {
  constructor(options) {
    assert(options.client, 'tc-lib-pulse client must be provided');

    this.taskcreator = options.taskcreator;
    this.Hook = options.Hook;
    this.Queues = options.Queues;
    this.client = options.client;
    this.monitor = options.monitor;
    this.pulseHookChangedListener = null;
    this.listeners = null;
    this._reconcileDone = Promise.resolve();
  }

  /**
   * Setup a new pulse client using the credentials
   * Additionally create pulse consumers for the exchanges -
   * `hook-created, `hook-updated` and  `hook-deleted`
  */
  async setup() {
    debug('Setting up the listeners');
    assert(this.listeners === null, 'Cannot setup twice');

    const client = this.client;
    let consumer = await pulse.consume({
      client,
      bindings: [{
        exchange: 'exchange/taskcluster-hooks/v1/hook-created',
        routingKeyPattern: '#',
      }, {
        exchange: 'exchange/taskcluster-hooks/v1/hook-updated',
        routingKeyPattern: '#',
      }, {
        exchange: 'exchange/taskcluster-hooks/v1/hook-deleted',
        routingKeyPattern: '#',
      }],
      queueName: 'hookChanged',
      maxLength: 50,
    }, (msg) => this.reconcileConsumers()
    );
    debug('Listening to hook exchanges');
    this.pulseHookChangedListener = consumer;
    this.listeners = {};
    // Reconcile on start up
    await this.reconcileConsumers();
  }

  /** Create a new pulse consumer for a hook */
  async createListener(hookGroupId, hookId, queueName) {
    if (this.listeners[queueName]) {
      return;
    }

    debug(`${queueName}: creating listener (and queue if necessary)`);

    const client = this.client;
    const listener = await pulse.consume({
      client,
      queueName,
      maxLength: 50,
      // we manage bindings manually in syncBindings
      bindings: [],
    }, async ({payload}) => {
      // Get a fresh copy of the hook and fire it, if it still exists
      let latestHook = await this.Hook.load({
        hookGroupId: hookGroupId,
        hookId: hookId,
      }, true);
      if (latestHook) {
        try {
          await this.taskcreator.fire(latestHook, {firedBy: 'pulseMessage', payload});
        } catch (err) {
          // any errors were already reported via the LastFire table, so they
          // can be safely ignored here
        }
      }
    });

    this.listeners[queueName] = listener;
  }

  /** Delete a listener for the given queueName  */
  async removeListener(queueName) {
    debug(`${queueName}: stop listening`);
    const listener = this.listeners[queueName];
    delete this.listeners[queueName];
    if (listener) {
      await listener.stop();
    }
  }

  /** Deletes the amqp queue if it exists for a real pulse client */
  async deleteQueue(queueName) {
    debug(`${queueName}: delete queue`);
    const fullQueueName = this.client.fullObjectName('queue', queueName);
    if (!this.client.isFakeClient) {
      await this.client.withChannel(async channel => {
        await channel.deleteQueue(fullQueueName);
      });
    }
  }

  /** Add / Remove bindings from he queue */
  async syncBindings(queueName, newBindings, oldBindings) {
    // for direct AMQP operations, we need the full name of the queue (with the
    // queue/<namespace> prefix)
    const fullQueueName = this.client.fullObjectName('queue', queueName);
    const result = [...oldBindings];

    if (this.client.isFakeClient) {
      // update the bindings for the FakePulseConsumer
      this.listeners[queueName].setFakeBindings(newBindings);
    } else {
      let intersection = _.intersectionWith(oldBindings, newBindings, _.isEqual);
      const delBindings = _.differenceWith(oldBindings, intersection, _.isEqual);
      const addBindings = _.differenceWith(newBindings, intersection, _.isEqual);
      if (!addBindings.length && !delBindings.length) {
        return;
      }
      debug(`${queueName}: updating bindings to ${JSON.stringify(newBindings)}`);
      await this.client.withChannel(async channel => {
        // perform unbinds first; these do not fail if the binding doesn't exist,
        // making them idempotent.
        for (let {exchange, routingKeyPattern} of delBindings) {
          await channel.unbindQueue(fullQueueName, exchange, routingKeyPattern);
        }
        // bindings will fail if the exchange doesn't exist, and such a failure
        // will kill the connection.  So if a user adds two new binding, and the
        // first is invalid, the second won't be added until the first is fixed.
        // Errors will be reported via monitor.
        for (let {exchange, routingKeyPattern} of addBindings) {
          await channel.bindQueue(fullQueueName, exchange, routingKeyPattern);
        }
      });
    }

    return result;
  }

  /**
   * Run only one exeuction of this function at a time, reporting any errors to the monitor.
   */
  _synchronise(asyncfunc) {
    return this._reconcileDone = this._reconcileDone
      .then(asyncfunc)
      .catch(err => this.monitor.reportError(err));
  }

  /**
   * Reconcile consumers with the set of active queues and the current contents
   * of the Hooks table.
   *
   * This is a three-way synchronization: the Hooks table is authoritative, and
   * is used both to update the state of the pulse AMQP server and to configure
   * the consumers in this process.
   */
  reconcileConsumers() {
    return this._synchronise(async () => {
      let queues = [];
      await this.Queues.scan({}, {
        limit: 1000,
        handler: (queue) => queues.push(queue)});

      await this.Hook.scan({}, {
        limit: 1000,
        handler: async (hook) => {
          if (hook.bindings.length === 0) {
            return;
          }

          const {hookGroupId, hookId} = hook;
          const queueName = `${hookGroupId}/${hookId}`;

          try {
            const queue = _.find(queues, {hookGroupId, hookId});
            if (queue) {
              if (!this.listeners[queue.queueName]) {
                await this.createListener(hookGroupId, hookId, queue.queueName);
              }

              // update the bindings of the queue to be in sync with the Hooks table
              await this.syncBindings(queue.queueName, hook.bindings, queue.bindings);

              // update the bindings in the Queues Azure table
              if (!_.isEqual(queue.bindings, hook.bindings)) {
                await queue.modify((queue) => {
                  queue.bindings = hook.bindings;
                });
              }

              // this queue has been reconciled, so remove it from the list
              _.pull(queues, queue);
            } else {
              await this.createListener(hookGroupId, hookId, queueName);
              await this.syncBindings(queueName, hook.bindings, []);

              // Add to Queues table
              await this.Queues.create({
                hookGroupId,
                hookId,
                queueName: `${hookGroupId}/${hookId}`,
                bindings: hook.bindings,
              });
            }
          } catch (err) {
            // report errors per hook, and continue on to try to reconcile the next hook.
            this.monitor.reportError(err, {hookGroupId, hookId});
          }
        },
      });

      // Delete the queues now left in the queues list.
      for (let queue of queues) {
        if (this.listeners[queue.queueName]) {
          await this.removeListener(queue.queueName);
        }
        await this.deleteQueue(queue.queueName);
        await queue.remove();
      }
    });
  }

  async terminate() {
    // stop all consumers
    if (!this.client.isFakeClient) {
      this.listeners.forEach(async (consumer) => {
        await consumer.stop();
      });
    }
    this.listeners = null;
  }
}

module.exports = HookListeners;
