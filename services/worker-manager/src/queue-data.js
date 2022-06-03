let assert = require('assert');
let _ = require('lodash');
const { paginateResults } = require('taskcluster-lib-api');

class TaskQueue {
  // (private constructor)
  constructor(props) {
    Object.assign(this, props);
  }

  // Create a single instance from a DB row
  static fromDb(row) {
    return new TaskQueue({
      taskQueueId: row.task_queue_id,
      expires: row.expires,
      lastDateActive: row.last_date_active,
      description: row.description,
      stability: row.stability,
    });
  }

  // Create a single instance, or undefined, from a set of rows containing zero
  // or one elements.  This matches the semantics of get_task_queue
  static fromDbRows(rows) {
    if (rows.length === 1) {
      return TaskQueue.fromDb(rows[0]);
    }
  }

  // Create an instance from createTaskQueue API request arguments
  static fromApi(taskQueueId, input) {
    assert(input.expires);
    assert(input.lastDateActive);
    return new TaskQueue({
      taskQueueId,
      ...input,
      // convert to dates
      expires: new Date(input.expires),
      lastDateActive: new Date(input.lastDateActive),
    });
  }

  // Get a worker type from the DB, or undefined
  static async get(db, taskQueueId, expires) {
    return TaskQueue.fromDbRows(await db.fns.get_task_queue_wm_2(taskQueueId, expires));
  }

  // Call db.get_task_queues.
  // The response will be of the form { rows, continationToken }.
  // If there are no worker types to show, the response will have the
  // `rows` field set to an empty array.
  static async getTaskQueues(
    db,
    {
      taskQueueId,
      expires,
    },
    {
      query,
    } = {},
  ) {
    const fetchResults = async (query) => {
      const { continuationToken, rows } = await paginateResults({
        query,
        fetch: (size, offset) => db.fns.get_task_queues_wm(
          taskQueueId || null,
          expires || null,
          size,
          offset,
        ),
      });
      const entries = rows.map(TaskQueue.fromDb);

      return { rows: entries, continuationToken: continuationToken };
    };

    // Fetch results
    return fetchResults(query || {});
  }

  // Get a list with all the task queues in the DB, possibly filtered
  // by `expires`, without pagination.
  static async getAllTaskQueues(db, expires) {
    return (await db.fns.get_task_queues_wm(
      null,
      expires || null,
      null,
      null,
    )).map(TaskQueue.fromDb);
  }

  // return the serialization of this task queue
  serialize() {
    return {
      taskQueueId: this.taskQueueId,
      expires: this.expires?.toJSON(),
      lastDateActive: this.lastDateActive?.toJSON(),
      description: this.description,
      stability: this.stability,
    };
  }

  // Compare to another task queue (used to check idempotency)
  equals(other) {
    return _.isEqual(other, this);
  }
}

// Export TaskQueue
exports.TaskQueue = TaskQueue;
