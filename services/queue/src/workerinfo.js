const taskcluster = require('taskcluster-client');
const assert = require('assert');
const debug = require('debug')('workerinfo');

class WorkerInfo {
  constructor(options) {
    assert(options);
    assert(options.db);
    this.db = options.db;

    // update `expires` values in postgres at this frequency; larger values give less accurate
    // expires times, but reduce database traffic.
    this.updateFrequency = '30 min';
    this.nextUpdateAt = {};
  }

  /**
   * Mark a value as seen, only actually updating the postgres table row
   * occasionally. This takes the approach of updating the row immediately on
   * the first call, then not updating until `updateFrequency` has elapsed.
   * Thus the `expires` value on a row may be out-of-date by `updateFrequency`.
   *
   * Note that the cache is never purged of outdated entries; this assumes that
   * the process is restarted on a daily basis, so there is not too much time
   * for stale cache entries to accumulate.
   */
  async valueSeen(key, updateExpires) {
    let now = new Date();
    let nextUpdate = this.nextUpdateAt[key];
    if (!nextUpdate || nextUpdate < now) {
      this.nextUpdateAt[key] = taskcluster.fromNow(this.updateFrequency);

      await updateExpires();
    }
  }

  async seen(taskQueueId, workerGroup, workerId) {
    const newExpiration = workerId ? taskcluster.fromNow('1 day') : taskcluster.fromNow('5 days');
    const promises = [];

    // task queue seen
    if (taskQueueId) {
      promises.push(this.valueSeen(taskQueueId, async () => {
        await this.db.fns.task_queue_seen({
          task_queue_id_in: taskQueueId,
          expires_in: newExpiration,
          description_in: null,
          stability_in: null,
        });
      }));
    }

    // worker seen
    if (taskQueueId && workerGroup && workerId) {
      promises.push(this.valueSeen(`${taskQueueId}/${workerGroup}/${workerId}`, async () => {
        await this.db.fns.queue_worker_seen_with_last_date_active({
          task_queue_id_in: taskQueueId,
          worker_group_in: workerGroup,
          worker_id_in: workerId,
          expires_in: newExpiration,
        });
      }));
    }

    await Promise.all(promises);
  }

  async expire(now) {
    let count;

    debug('Expiring worker-types at: %s, from before %s', new Date(), now);
    count = await this.db.fns.expire_task_queues(now);
    debug('Expired %s worker-types', count);

    debug('Expiring workers at: %s, from before %s', new Date(), now);
    count = await this.db.fns.expire_queue_workers(now);
    debug('Expired %s workers', count);
  }

  async taskSeen(taskQueueId, workerGroup, workerId, tasks) {
    // note that the common case is one task, and a DB function to insert one
    // task is much simpler to write, so we just loop over this probably-one-element
    // array.
    for (let task of tasks) {
      await this.db.fns.queue_worker_task_seen({
        task_queue_id_in: taskQueueId,
        worker_group_in: workerGroup,
        worker_id_in: workerId,
        task_run_in: { taskId: task.status.taskId, runId: task.status.runs.length - 1 },
      });
    }
  }
}

module.exports = WorkerInfo;
