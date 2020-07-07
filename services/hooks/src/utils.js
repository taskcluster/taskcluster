const assert = require('assert').strict;
const { paginateResults } = require('taskcluster-lib-api');

const lastFireUtils = {
  // Create a single instance, or undefined, from a set of rows containing zero
  // or one elements.
  fromDbRows(rows) {
    if (rows.length === 1) {
      return exports.lastFireUtils.fromDb(rows[0]);
    }
  },
  // Create a single instance from a DB row
  fromDb(row) {
    return {
      hookGroupId: row.hook_group_id,
      hookId: row.hook_id,
      firedBy: row.fired_by,
      taskId: row.task_id,
      taskCreateTime: row.task_create_time,
      result: row.result,
      error: row.error,
      etag: row.etag,
    };
  },
  //  Get last Fires using a handler function.
  // This is also to avoid loading all rows in memory.
  async getLastFires(db, {hookGroupId, hookId}, handler) {
    assert(!handler || handler instanceof Function,
      'If options.handler is given it must be a function');

    const fetchResults = async (continuation) => {
      const query = continuation ? { continuationToken: continuation } : {};
      const {continuationToken, rows} = await paginateResults({
        query,
        fetch: (size, offset) => db.fns.get_last_fires(
          hookGroupId,
          hookId,
          size,
          offset,
        ),
      });

      const entries = rows.map(exports.lastFireUtils.fromDb);

      return { rows: entries, continuationToken: continuationToken };
    };

    // Fetch results
    let results = await fetchResults({});

    const handleResults = async (res) => {
      await Promise.all(res.rows.map((item) => handler.call(item, item)));

      if (res.continuationToken) {
        return await handleResults(await fetchResults(res.continuationToken));
      }
    };

    results = await handleResults(results);

    return results;
  },
  definition(lastFire) {
    return Promise.resolve({
      hookGroupId: lastFire.hookGroupId,
      hookId: lastFire.hookId,
      firedBy: lastFire.firedBy,
      taskId: lastFire.taskId,
      taskCreateTime: lastFire.taskCreateTime,
      result: lastFire.result,
      error: lastFire.error,
    });
  },
};

exports.lastFireUtils = lastFireUtils;
