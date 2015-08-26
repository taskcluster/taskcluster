var assert = require('assert');
var Promise = require('promise');
var data = require('data');
var base = require('taskcluster-base');
var slugid = require('slugid');
var datejs  = require('date.js');

class Scheduler {
  constructor(options) {
    assert(options, "options must be given");
    assert(options.Hook.prototype instanceof data.Hook,
        "Expected data.Hook instance");
    assert(options.queue instanceof taskcluster.Queue,
        "An instance of taskcluster.Queue is required");
    assert(typeof(options.pollingDelay) == 'number',
        "Expected pollingDelay to be a number");
    // Store options on this for use in event handlers
    this.Hook = options.Hook;
    this.queue = options.queue;

    this.done = null;
    this.stopping = false;
  }

  start() {
    if (this.done) {
      return;
    }
    this.stopping = false;

    this.done = poll().catch((err) => {
      debug("Error: %s, as JSON: %j", err, err, err.stack);
      throw err;
    }).then(() => {
      this.done = null;
    });
  }

  async poll() {
    while(!this.stopping) {
      var hooks = await this.Hook.scan({
        schedule: base.Entity.Op.notEqual(''),
        nextScheduledDate: base.Entity.Op.lessThan(new Date())
      }, {});

      await Promise.all(hooks.entries.map(function(hook) {
        let task = hook.taskPayload();
        queue.createTask(hook.nextTaskId, task).then(function(resp) {
          hook.modify(hook => {
            hook.nextTaskId = slugid();
            hook.nextScheduledDate = datejs(hook.schedule);
          });
        }
        }));

      await this.sleep(this.pollingDelay);
    }
  }

  sleep(delay) {
    return new Promise((accept) => { setTimeout(accept, delay); });
  }
}
