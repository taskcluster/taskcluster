const {Database} = require('taskcluster-lib-postgres');
const {schema} = require('./schema');

class ETA {
  // end is the final count, for ETA
  constructor({end, historyLength}) {
    this.end = end;
    this.historyLength = historyLength;

    this.history = [];
  }

  measurement(val) {
    this.history.push([Date.now(), val]);
    while (this.history.length > this.historyLength) {
      this.history.shift();
    }
  }

  // return the rate in counts per ms
  rate() {
    if (this.history.length < 2) {
      return NaN;
    }

    const [first, last] = [this.history[0], this.history[this.history.length - 1]];
    return (last[1] - first[1]) / (last[0] - first[0]);
  }

  eta() {
    const rate = this.rate();
    if (isNaN(rate) || !rate) {
      return rate;
    }

    const last = this.history[this.history.length - 1];
    const remainingCount = this.end - last[1];
    const remainingTime = remainingCount / rate;
    return new Date(Date.now() + remainingTime);
  }
}

const driveMigrationToCompletion = async ({db, showProgress}) => {
  await db._withClient('admin', async client => {
    // see if the old tables still exist; if not, we've already finished
    try {
      await client.query('select 1 from queue_tasks_entities limit 1');
    } catch (err) {
      if (err.code !== '42P01') {
        throw err;
      }
      showProgress('Migration already complete');
      return;
    }

    // get a (rough) count for the table
    const {rows: [{estimate}]} = await client.query(`SELECT reltuples::BIGINT AS estimate FROM pg_class WHERE relname='queue_tasks_entities'`);

    while (true) {
      // the last taskId we saw from the previous batch
      let taskId = null;

      // aim to do each batch in this amount of time (seconds)
      const batchTime = 10;
      let n = 100;

      let count = 0;
      const eta = new ETA({end: estimate, historyLength: 500});

      while (true) {
        await client.query('begin');
        try {
          const res = await client.query(`select * from v20_migration_migrate_tasks($1, $2)`, [taskId, n]);
          if (res.rows.length === 0) {
            break;
          }

          count += res.rows.length;
          eta.measurement(count);

          taskId = res.rows[res.rows.length - 1].v20_migration_migrate_tasks;

          const rate = eta.rate();
          const perSec = Math.round(rate * 10000) / 10;
          const finishAt = eta.eta();
          const hoursUntilFinish = Math.round((finishAt - new Date()) / (10 * 3600)) / 100;

          showProgress(`migrated ${res.rows.length} rows, finishing with ${taskId} - ${count} rows, ${perSec}/s, ETA ${finishAt} (in ${hoursUntilFinish}h)`);

          // recalculate n to try to get a consistent batchTime
          if (!isNaN(rate)) {
            n = Math.round(batchTime * rate * 1000);
          }
        } finally {
          await client.query('end');
        }
      }

      try {
        await client.query('begin');
        const res = await client.query('select * from v20_migration_is_complete()');
        if (res.rows[0].v20_migration_is_complete) {
          break;
        }
      } finally {
        await client.query('end');
      }

      showProgress('some rows migrated, but not complete yet; will try again (remaining tasks have not reached deadline)');
      await new Promise(res => setTimeout(res, batchTime * 1000));
    }

    showProgress('all rows migrated; calling v20_migration_finish');
    await client.query(`select * from v20_migration_finish()`);
    showProgress('migration finished');
  });
};

module.exports = async ({adminDbUrl, showProgress, usernamePrefix, toVersion}) => {
  // NOTE: this script is idempotent and can be stopped and re-started at will.

  // step 1: upgrade to v20
  await Database.upgrade({
    schema: schema({useDbDirectory: false}),
    showProgress,
    usernamePrefix,
    adminDbUrl,
    toVersion: 20,
  });

  // set up a DB for the remaining steps
  const db = new Database({urlsByMode: {admin: adminDbUrl, read: adminDbUrl}});

  // check that we are at version 20 and no higher
  const currentVersion = await db.currentVersion();
  if (currentVersion > 20) {
    showProgress(`DB is already at version ${currentVersion}; nothing to do`);
    return;
  } else if (currentVersion < 20) {
    showProgress(`DB is only at version ${currentVersion}; upgrade script failed?`);
    return;
  }

  await driveMigrationToCompletion({db, showProgress});

  await db.close();
};
