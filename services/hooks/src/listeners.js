const assert = require('assert');
const pulse = require('taskcluster-lib-pulse');
const pSynchronize = require('p-synchronize');
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

    const sync = pSynchronize();
    this.reconcileConsumers = sync(() => this._reconcileConsumers());
  }

  /**
   * Setup a new pulse client using the credentials
   * Additionally create pulse consumers for the exchanges -
   * `hook-created, `hook-updated` and  `hook-deleted`
  */
  async setup() {
    this.monitor.debug('Setting up the listeners');
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
    }, (msg) => this.reconcileConsumers(),
    );
    this.monitor.debug('Listening to hook exchanges');
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

    this.monitor.debug(`${queueName}: creating listener (and queue if necessary)`);

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
    this.monitor.debug(`${queueName}: stop listening`);
    const listener = this.listeners[queueName];
    delete this.listeners[queueName];
    if (listener) {
      await listener.stop();
    }
  }

  /** Deletes the amqp queue if it exists for a real pulse client */
  async deleteQueue(queueName) {
    this.monitor.debug(`${queueName}: delete queue`);
    const fullQueueName = this.client.fullObjectName('queue', queueName);
    if (!this.client.isFakeClient) {
      await this.client.withChannel(async channel => {
        await channel.deleteQueue(fullQueueName);
      });
    }
  }

  /** Add / Remove bindings from the queue and return the set of bindings that
   * are in place.  This may differ from newBindings if, for example, an exchange
   * does not exist or a routingKeyPattern is invalid.
   */
  async syncBindings(queueName, newBindings, oldBindings) {
    // for direct AMQP operations, we need the full name of the queue (with the
    // queue/<namespace> prefix)
    const fullQueueName = this.client.fullObjectName('queue', queueName);
    let result = [...oldBindings];

    if (this.client.isFakeClient) {
      // update the bindings for the FakePulseConsumer
      this.listeners[queueName].setFakeBindings(newBindings);
      return newBindings;
    }

    let intersection = _.intersectionWith(oldBindings, newBindings, _.isEqual);
    const delBindings = _.differenceWith(oldBindings, intersection, _.isEqual);
    const addBindings = _.differenceWith(newBindings, intersection, _.isEqual);
    if (!addBindings.length && !delBindings.length) {
      return newBindings;
    }
    this.monitor.debug(`${queueName}: updating bindings to ${JSON.stringify(newBindings)}`);

    // unbinding queues will always succeed, even if the binding is not in place, so we don't
    // do any special error handling here.
    if (delBindings.length > 0) {
      await this.client.withChannel(async channel => {
        for (let {exchange, routingKeyPattern} of delBindings) {
          await channel.unbindQueue(fullQueueName, exchange, routingKeyPattern);
          result = result.filter(
            ({exchange: e, routingKeyPattern: r}) => e !== exchange || r !== routingKeyPattern);
        }
      });
    }

    // We performe each of the bind operations in a distinct channel, as a failure of the operation
    // will invalidate the channel.  Failures are handled by simply not marking the binding
    // as complete and leaving if for the next reconciliation to try again.
    for (let {exchange, routingKeyPattern} of addBindings) {
      try {
        await this.client.withChannel(channel =>
          channel.bindQueue(fullQueueName, exchange, routingKeyPattern));
        // success! add that binding to the list
        result.push({exchange, routingKeyPattern});
      } catch (err) {
        if (err.code !== 404 && err.code !== 403) {
          throw err;
        }

        // No such exchange or no permission.. better luck next time!  There's no practical
        // way to communicate this back to the user, since the bind is asynchronous and occurs
        // after the `updateHook` API method has returned, so we just log the issue and move on.
        // This will be retried on every reconciliation, so if the error is transient it will
        // eventually succeed.
        this.monitor.notice(`error binding exchange ${exchange} with ${routingKeyPattern}: ${err} (ignored)`);
      }
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
   *
   * Note that use of p-synchronize ensures this function is executing at most once
   * at any time.
   */
  async _reconcileConsumers() {
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

            // update the bindings of the queue based on what was actually boubnd; if this
            // is still not equal to the bindings in the hooks table, then on the next
            // reconciliation we will try again
            const boundBindings = await this.syncBindings(queue.queueName, hook.bindings, queue.bindings);

            // update the bindings in the Queues Azure table
            if (!_.isEqual(queue.bindings, hook.bindings)) {
              await queue.modify((queue) => {
                queue.bindings = boundBindings;
              });
            }

            // this queue has been reconciled, so remove it from the list
            _.pull(queues, queue);
          } else {
            await this.createListener(hookGroupId, hookId, queueName);
            const boundBindings = await this.syncBindings(queueName, hook.bindings, []);

            // Add to Queues table
            await this.Queues.create({
              hookGroupId,
              hookId,
              queueName: `${hookGroupId}/${hookId}`,
              bindings: boundBindings,
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
