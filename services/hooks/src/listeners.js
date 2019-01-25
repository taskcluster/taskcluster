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
    this.listeners = [];
    // Reconcile on start up
    await this.reconcileConsumers();
  }

  /** Create a new pulse consumer for a hook */
  async createListener(hook, queueName) {
    debug(`${queueName}: creating listener (and queue if necessary)`);

    const client = this.client;
    const listener = await pulse.consume({
      client,
      queueName,
      maxLength: 50,
      // we manage bindings manually in syncBindings
      bindings: [],
    }, async ({payload}) => {
      // Fire the hook
      await this.taskcreator.fire(hook, {firedBy: 'pulseMessage', payload});
    });

    this.listeners.push(listener);
  }

  /** Delete a listener for the given queueName  */
  async removeListener(queueName) {
    debug(`${queueName}: stop listening`);
    let removeIndex = this.listeners.findIndex(({_queueName}) => _queueName === queueName);
    if (removeIndex > -1) {
      const listener = this.listeners[removeIndex];
      await listener.stop();
      this.listeners.splice(removeIndex, 1);
    }
  }

  haveListener(queueName) {
    const index = this.listeners.findIndex(({_queueName}) => _queueName === queueName);
    return index > -1;
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
    if (!this.client.isFakeClient) {
      let intersection = _.intersectionWith(oldBindings, newBindings, _.isEqual);
      const delBindings = _.differenceWith(oldBindings, intersection, _.isEqual);
      const addBindings = _.differenceWith(newBindings, intersection, _.isEqual);
      if (!addBindings.length && !delBindings.length) {
        return;
      }
      debug(`${queueName}: updating bindings to ${JSON.stringify(newBindings)}`);
      for (let {exchange, routingKeyPattern} of delBindings) {
        await this.client.withChannel(async channel => channel.unbindQueue(fullQueueName, exchange, routingKeyPattern));
      }
      for (let {exchange, routingKeyPattern} of addBindings) {
        try {
          await this.client.withChannel(async channel => channel.bindQueue(fullQueueName, exchange, routingKeyPattern));
        } catch (err) {
          if (err.isOperational) {
            debug(`cannot bind to ${exchange} with pattern ${routingKeyPattern}: ${err}`);
            continue;
          }
          throw err;
        }
      }
    }
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
          const {hookGroupId, hookId} = hook;
          const queueName = `${hookGroupId}/${hookId}`;
          const hookDebug = msg => debug(`${queueName}: ${msg}`);
          if (hook.bindings.length !== 0) {
            const queue = _.find(queues, {hookGroupId, hookId});
            if (queue) {
              if (!this.haveListener(queue.queueName)) {
                await this.createListener(hook, queue.queueName);
              }

              // update the bindings of the queue to be in sync with the Hooks table
              await this.syncBindings(queue.queueName, hook.bindings, queue.bindings);

              // update the bindings in the Queues Azure table
              await queue.modify((queue) => {
                queue.bindings = hook.bindings;
              });

              // this queue has been reconciled, so remove it from the list
              _.pull(queues, queue);
            } else {
              await this.createListener(hook, queueName);
              await this.syncBindings(queueName, hook.bindings, []);

              // Add to Queues table
              await this.Queues.create({
                hookGroupId,
                hookId,
                queueName: `${hookGroupId}/${hookId}`,
                bindings: hook.bindings,
              });
            }
          }
        },
      });

      // Delete the queues now left in the queues list.
      for (let queue of queues) {
        await this.removeListener(queue.queueName);
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
