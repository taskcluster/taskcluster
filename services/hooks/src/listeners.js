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
      maxLength : 50,
    }, (msg) => this.reconcileConsumers()
    );
    debug('Listening to hook exchanges');
    this.pulseHookChangedListener = consumer;
    this.listeners = [];
    // Reconcile on start up
    await this.reconcileConsumers();
  }

  /** Create a new pulse consumer for a hook */
  async createListener(hook) {
    this.hook = hook;
    const client =  this.client;
    const queueName = `${hook.hookGroupId}/${hook.hookId}`; // serves as unique id for every listener
    const listener = await pulse.consume({
      client,
      queueName,
      maxLength : 50,
    }, async ({payload}) => {
      const hook = this.hook;
      // Fire the hook
      await this.taskcreator.fire(hook, {firedBy:'pulseMessage', payload});
    });
    this.listeners.push(listener);
  }

  /** Delete a listener for the given queueName  */
  async removeListener(queueName) {
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
    if (!this.client.isFakeClient) {
      if (await this.client.withChannel(async channel => channel.checkQueue(queueName))) {
        await this.client.withChannel(async channel => channel.deleteQueue(queueName));
      }
    }
  }
  
  /** Add / Remove bindings from he queue */
  async syncBindings(queueName, newBindings, oldBindings) {
    debug(`Updating the bindings of ${queueName}`);
    if (!this.client.isFakeClient) {
      let intersection = _.intersectionWith(oldBindings, newBindings, _.isEqual);
      oldBindings = _.differenceWith(oldBindings, intersection, _.isEqual);
      newBindings = _.differenceWith(newBindings, intersection, _.isEqual);
      for (let {exchange, routingKeyPattern} of oldBindings) {
        await this.client.withChannel(async channel => channel.unbindQueue(queueName, exchange, routingKeyPattern));
      }
      for (let {exchange, routingKeyPattern} of newBindings) {
        await this.client.withChannel(async channel => channel.bindQueue(queueName, exchange, routingKeyPattern));
      }
    }
  }

  _synchronise(asyncfunc) {
    return this._reconcileDone = this._reconcileDone.then(asyncfunc).catch(() => {});
  }

  reconcileConsumers() {
    return this._synchronise(async () => {
      let queues = [];
      await this.Queues.scan(
        {},
        {
          limit: 1000,
          handler:(queue) => queues.push(queue),
        }
      );
      
      await this.Hook.scan({}, {
        limit: 1000,
        handler: async (hook) => {
          if (hook.bindings.length !== 0) {
            const {hookGroupId, hookId} = hook;
            const queue = _.find(queues, {hookGroupId, hookId});
            if (queue) {
              if (!this.haveListener(queue.queueName)) {
                debug('Existing queue..creating listener');
                await this.createListener(hook);
              }
              _.pull(queues, queue);
              // update the bindings of the queue to be in sync with that in the Hooks table
              await this.syncBindings(queue.queueName, hook.bindings, queue.bindings);
              // update the bindings in the Queues Azure table
              await queue.modify((queue) => {
                queue.bindings = hook.bindings;
              });
            } else {
              debug('New queue..creating listener');
              await this.createListener(hook);
              const queueName = `${hookGroupId}/${hookId}`;
              await this.syncBindings(queueName, hook.bindings, []);
              // Add to Queues table
              debug('Adding to Queues table');
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
        // Delete the amqp queue
        await this.deleteQueue(queue.queueName);
        // Delete from this.listeners
        await this.removeListener(queue.queueName);
        await queue.remove();
      }
    });
  }

  async terminate() {
    debug('Deleting all queues..');
    await this.Queues.scan(
      {},
      {
        limit: 1000,
        handler: async (queue) => {
          // Delete the amqp queue
          await this.deleteQueue(queue.queueName);
          await queue.remove();
        },
      }
    );

    // stop all consumers instead
    if (!this.client.isFakeClient) {
      this.listeners.forEach(async (consumer) => {
        await consumer.stop();
      });
    }
    this.listeners = null;
  }
}

module.exports = HookListeners;
