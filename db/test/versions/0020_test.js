const _ = require('lodash');
const debug = require('debug')('db-version.0020');
const taskcluster = require('taskcluster-client');
const helper = require('../helper');
const testing = require('taskcluster-lib-testing');
const assert = require('assert').strict;
const Entity = require('taskcluster-lib-entities');
const {ignorePgErrors, UNDEFINED_TABLE} = require('taskcluster-lib-postgres');

const THIS_VERSION = parseInt(/.*\/0*(\d+)_test\.js/.exec(__filename)[1]);
const PREV_VERSION = THIS_VERSION - 1;

// (adapted from services/queue/src/data.js) NOTE: this will be
// removed when tc-lib-entities is dropped from the repository
const Task = Entity.configure({
  version: 1,
  partitionKey: Entity.keys.StringKey('taskId'),
  rowKey: Entity.keys.ConstantKey('task'),
  properties: {
    taskId: Entity.types.SlugId,
    provisionerId: Entity.types.String,
    workerType: Entity.types.String,
    schedulerId: Entity.types.String,
    taskGroupId: Entity.types.SlugId,
    dependencies: Entity.types.JSON,
    requires: Entity.types.String,
    routes: Entity.types.JSON,
    priority: Entity.types.String,
    retries: Entity.types.Number,
    retriesLeft: Entity.types.Number,
    created: Entity.types.Date,
    deadline: Entity.types.Date,
    expires: Entity.types.Date,
    scopes: Entity.types.JSON,
    payload: Entity.types.JSON,
    metadata: Entity.types.JSON,
    tags: Entity.types.JSON,
    extra: Entity.types.JSON,
    runs: Entity.types.JSON,
    takenUntil: Entity.types.Date,
  },
  context: [],
});

let TaskGroupMember = Entity.configure({
  version: 1,
  partitionKey: Entity.keys.StringKey('taskGroupId'),
  rowKey: Entity.keys.StringKey('taskId'),
  properties: {
    taskGroupId: Entity.types.SlugId,
    taskId: Entity.types.SlugId,
    expires: Entity.types.Date,
  },
});

// (adapted from services/queue/src/data.js) NOTE: this will be
// removed when tc-lib-entities is dropped from the repository
let TaskGroupActiveSet = Entity.configure({
  version: 1,
  partitionKey: Entity.keys.StringKey('taskGroupId'),
  rowKey: Entity.keys.StringKey('taskId'),
  properties: {
    taskGroupId: Entity.types.SlugId,
    taskId: Entity.types.SlugId,
    expires: Entity.types.Date,
  },
});

const driveMigrationToCompletion = async (finish) => {
  await helper.withDbClient(async client => {
    while (true) {
      let taskId = null;
      while (true) {
        await client.query('begin');
        try {
          const res = await client.query(`select * from v20_migration_migrate_tasks($1, 3)`, [taskId]);
          if (res.rows.length === 0) {
            break;
          }
          debug(`migrated ${res.rows.map(r => r.v20_migration_migrate_tasks).join(', ')}`);
          taskId = res.rows[res.rows.length - 1].v20_migration_migrate_tasks;
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

      debug('some rows migrated, but not complete yet');
      await testing.sleep(100);
    }

    if (!finish) {
      debug('rows migrated, but not calling v20_migration_finish');
      return;
    }

    debug('rows migrated; calling v20_migration_finish');
    await client.query(`select * from v20_migration_finish()`);
    debug('migration finished');
  });
};

suite(testing.suiteName(), function() {
  helper.withDbForVersion();

  test('tables created / removed on upgrade and downgrade', async function() {
    await testing.resetDb({testDbUrl: helper.dbUrl});
    await helper.upgradeTo(PREV_VERSION);

    await helper.assertTable('queue_tasks_entities');
    await helper.assertTable('queue_task_group_members_entities');
    await helper.assertTable('queue_task_group_active_sets_entities');
    await helper.assertNoTable('tasks');

    await helper.upgradeTo(THIS_VERSION);
    await helper.assertTable('queue_tasks_entities');
    await helper.assertTable('queue_task_group_members_entities');
    await helper.assertTable('queue_task_group_active_sets_entities');
    await helper.assertTable('tasks');

    await driveMigrationToCompletion(true);
    await helper.assertNoTable('queue_tasks_entities');
    await helper.assertNoTable('queue_task_group_members_entities');
    await helper.assertNoTable('queue_task_group_active_sets_entities');
    await helper.assertTable('tasks');

    await helper.downgradeTo(PREV_VERSION);
    await helper.assertTable('queue_tasks_entities');
    await helper.assertTable('queue_task_group_members_entities');
    await helper.assertTable('queue_task_group_active_sets_entities');
    await helper.assertNoTable('tasks');
  });

  const takenUntil = new Date(2020, 12, 31);
  const deadline = taskcluster.fromNow('3 seconds'); // enough time to loop through migrations a bit..
  const expires = taskcluster.fromNow('1 day');
  const baseTask = {
    provisionerId: 'pp',
    workerType: 'wt',
    schedulerId: 'sched',
    dependencies: [],
    requires: 'all-completed',
    priority: 'high',
    routes: [],
    retries: 0,
    retriesLeft: 5,
    created: new Date(),
    deadline,
    expires,
    scopes: [],
    payload: {},
    metadata: {},
    tags: [],
    extra: {},
    runs: [],
    takenUntil: new Date(0),
  };
  const tgTaskIds = [
    // note that these are sorted using en_US.utf8 collation
    '7-bz8j_nQQaDQGa9SokueA',
    'bday-EyrSvOCX5sWf5y0vQ',
    'GXCEcvbRSJeYrKw5XbnOZw',
    'lxUFJhJFS2CKHCcbuKCMhA',
    'orr9Pla4S2SzNbKkRqP0sg',
  ];

  const TABLES = [
    'tasks',
    'queue_tasks_entities',
    'queue_task_group_members_entities',
    'queue_task_group_active_sets_entities',
  ];

  const logTableSizes = async (when) => {
    await helper.withDbClient(async client => {
      for (let table of TABLES) {
        await ignorePgErrors((async () => {
          const res = await client.query(`select count(*) from ${table}`);
          if (res) {
            debug(`[${when}] table ${table} has ${res.rows[0].count} rows`);
          }
        })(), UNDEFINED_TABLE);
      }
    });
  };

  // Task IDs for the tasks used in the mid-migration tests.  Each group of ten
  // tasks is assigned to a task group with id matching the first task in that
  // group.  Odd-indexed tasks are active (!ever_resolved or still in
  // TaskGroupActiveSets).  Deadlines are each 100ms after the previous task.
  // All tasks but the first two expire in the future.
  const TASK_IDS = [
    'IX5PWtp7ThSjxK6ISM7Hmg', // taskGroupId   expired
    'WclXiQXuQnKoADDlhFj4Nw', // active        expired
    'hLT0Ln4qT568tLhIspuDAA',
    'xwZee4_tQWqLl2JTUsdw7Q', // active
    '9bW3Kjp6QUmTJ_ti50i8XA',
    '6U815zO-SveFJcPUPwjppg', // active
    '4ODdqEE-Q86CpiRBGi8eZw',
    'AfZTiPuKS0O33n_k4wb8zw', // active
    '1JUNrLxKR-qgtVRYIsmxtA',
    '3xrha8L0R6aBbumNVx0Ing', // active

    'yr0ooCqZS0GRfEalI91XBA', // taskGroupId
    'DvCF59H8T5iKlryrUiUJDw', // active
    '_pdQ_xLpS0-ZRY6q8cl7Vw',
    'S1GY6xMvSWiJl5fsmiQJ2w', // active
    'eEK_nko3Q4SWivs4i655xg',
    // above created before migration; remainder created after migration
    '9suXitstQzmnTsoUu18nKQ', // active
    'y5zXdJ5ZTPeV3G-zOWUjBw',
    '4Vh6v58ZRGm5wOXEQXlbaA', // active
    'YS2jFwHSStGN0N98HLS8iA',
    'AwbqrOyqQlSec--m9kEwtg', // active

    'yzLPVE-yRgOSFAxD1Emexw', // taskGroupId
    'bKvveO08Rcq25gFif1Wu-w', // active
    '8YCwWDReSHiW9ksQWpi_mA',
    'wgVl8XlqQEyiyE9J5vyqeg', // active
    'mG38ambBTzyc8GxuDtEd-Q',
    'Q-iYpwvmRoyG_1qWeIAfwg', // active
    'bkjFVD3NTfuXkXOqfweUiQ',
    'oKs1Iq-JRJm2c1UE5QysWg', // active
    '7zyP464LS3-oUA-yOIh_tg',
    '1yBlR140Toye-n-P9_jORg', // active
  ];

  const resetTables = async () => {
    await helper.withDbClient(async client => {
      for (let tableName of TABLES) {
        await ignorePgErrors(client.query(`truncate ${tableName}`), UNDEFINED_TABLE);
      }
    });
  };

  const makeMidMigrationTests = (title, upgradeFn, {
    // if true, expected tasks [0-15] to be inactive after migration
    migratedRowsNotActive,
    // if true, a scan for expired things should return nothing (either because
    // it's hard coded to do so, or because expired tasks were not migrated)
    expirationScanReturnsNothing,
    // if false, the expired task (index 0) is gone from the tables
    expiredTaskPresent,
    // if true, then removing tasks is a no-op
    taskRemovalNoop,
  } = {}) => {
    let TaskGroupMemberEntity, TaskGroupActiveSetEntity, TaskEntity;

    // this is set just before the tasks are created, and used to calculate a
    // staggered set of deadlines so that the migration must iteratively process
    // individual rows.
    let deadlineBase;

    // fixed takenUntil value for all tasks
    const takenUntil = new Date(2021, 0, 20);

    const isExpired = i => i < 2;

    const createTaskI = async i => {
      const taskId = TASK_IDS[i];
      const taskGroupId = TASK_IDS[i - (i % 10)];
      const active = !!(i & 1);
      const deadline = new Date(deadlineBase.getTime() + 100 * i);
      const expires = isExpired(i) ? taskcluster.fromNow('-1 day') : taskcluster.fromNow('1 day');
      debug(`${i}: taskId ${taskId} taskGroupId ${taskGroupId} active ${active}`);

      await TaskEntity.create({
        ...baseTask,
        taskId,
        taskGroupId,
        schedulerId: `s-${i}`,
        expires,
        deadline,
        takenUntil,
      });
      await TaskGroupMemberEntity.create({
        taskId,
        taskGroupId,
        expires,
      });

      // always mark active, then deactivate inactive tasks, as this is the
      // way the queue service does it
      await TaskGroupActiveSetEntity.create({
        taskId,
        taskGroupId,
        expires,
      });
      if (!active) {
        await TaskGroupActiveSetEntity.remove({
          taskId,
          taskGroupId,
        });
      }
    };

    suite(`mid-migration ${title}`, function() {
      suiteSetup(async function() {
        await helper.toDbVersion(PREV_VERSION);
        await resetTables();

        const db = await helper.setupDb('queue');
        TaskEntity = await Task.setup({
          db,
          serviceName: 'test',
          tableName: 'queue_tasks_entities',
          monitor: false,
          context: {},
        });
        TaskGroupMemberEntity = await TaskGroupMember.setup({
          db,
          serviceName: 'test',
          tableName: 'queue_task_group_members_entities',
          monitor: false,
          context: {},
        });
        TaskGroupActiveSetEntity = await TaskGroupActiveSet.setup({
          db,
          serviceName: 'test',
          tableName: 'queue_task_group_active_sets_entities',
          monitor: false,
          context: {},
        });
      });

      test('insert first 15 tasks', async function() {
        deadlineBase = taskcluster.fromNow('1 second');
        for (let i of _.range(15)) {
          await createTaskI(i);
        }
      });

      test(`run the migration (${title})`, async function() {
        await logTableSizes('before migration');
        await upgradeFn();
        await logTableSizes('after migration');
      });

      test('insert some more tasks', async function() {
        for (let i of _.range(15, 30)) {
          await createTaskI(i);
        }
        await logTableSizes('post-insert');
      });

      test('check loading those tasks', async function() {
        for (let [i, taskId] of TASK_IDS.entries()) {
          const taskGroupId = TASK_IDS[i - (i % 10)];
          debug(`${i}: taskId ${taskId} taskGroupId ${taskGroupId}`);
          const task = await TaskEntity.load({taskId}, true);
          assert.equal(!!task, isExpired(i) ? expiredTaskPresent : true);
          if (task) {
            assert.equal(task.taskId, taskId);
            assert.equal(task.taskGroupId, taskGroupId);
            assert.equal(task.schedulerId, `s-${i}`);
          }
        }
      });

      test('check loading task group members', async function() {
        for (let [i, taskId] of TASK_IDS.entries()) {
          const taskGroupId = TASK_IDS[i - (i % 10)];
          debug(`${i}: taskId ${taskId} taskGroupId ${taskGroupId}`);
          const tg = await TaskGroupMemberEntity.load({taskId, taskGroupId}, true);
          assert.equal(!!tg, isExpired(i) ? expiredTaskPresent : true);
          if (tg) {
            assert.equal(tg.taskId, taskId);
            assert.equal(tg.taskGroupId, taskGroupId);
          }
        }
      });

      test('check loading task group active set', async function() {
        for (let [i, taskId] of TASK_IDS.entries()) {
          const taskGroupId = TASK_IDS[i - (i % 10)];

          let active = !!(i & 1);
          if (migratedRowsNotActive && i < 15) {
            // migrating these rows marked them inactive
            active = false;
          }

          debug(`${i}: taskId ${taskId} taskGroupId ${taskGroupId} active ${active}`);
          const tg = await TaskGroupActiveSetEntity.load({taskId, taskGroupId}, true);
          assert.equal(!!tg, isExpired(i) ? active && expiredTaskPresent : active);
          if (tg) {
            assert.equal(tg.taskId, taskId);
            assert.equal(tg.taskGroupId, taskGroupId);
          }
        }
      });

      test('check a queue_tasks_entities expiration scan', async function() {
        const {entries} = await TaskEntity.scan({expires: Entity.op.lessThan(new Date())});
        const expiredTasks = entries.map(e => e.taskId);
        if (expirationScanReturnsNothing) {
          assert.deepEqual(expiredTasks, []);
        } else {
          assert.deepEqual(expiredTasks.sort(), TASK_IDS.slice(0, 2).sort());
        }
      });

      test('check a queue_tasks_entities scan with takenUntil=', async function() {
        const {entries} = await TaskEntity.scan({taskId: TASK_IDS[2], takenUntil});
        assert.equal(entries.length, 1);
        assert.equal(entries[0].taskId, TASK_IDS[2]);
      });

      test('check a queue_tasks_entities scan with deadline=', async function() {
        const deadline = new Date(deadlineBase.getTime() + 4 * 100);
        const {entries} = await TaskEntity.scan({taskId: TASK_IDS[4], deadline});
        assert.equal(entries.length, 1);
        assert.equal(entries[0].taskId, TASK_IDS[4]);
      });

      test('modify queue_tasks_entries', async function() {
        for (let [i, taskId] of TASK_IDS.entries()) {
          if (isExpired(i)) {
            continue;
          }
          const task = await TaskEntity.load({taskId});
          await task.modify(t => t.retriesLeft = (i % 5) + 1);
        }

        for (let [i, taskId] of TASK_IDS.entries()) {
          if (isExpired(i)) {
            continue;
          }
          const task = await TaskEntity.load({taskId});
          assert.equal(task.retriesLeft, (i % 5) + 1);
        }
      });

      const tgmScanTest = (title, i) => {
        const taskIds = TASK_IDS.slice(i, i + 10);
        const taskGroupId = taskIds[0];

        test(title, async function() {
          const {entries} = await TaskGroupMemberEntity.scan({
            taskGroupId,
            expires: Entity.op.greaterThanOrEqual(new Date()),
          });
          if (i === 0) {
            // this task group omits the two expired tasks
            assert.equal(entries.length, 8);
            assert.deepEqual(entries.map(e => e.taskId).sort(), taskIds.slice(2, 10).sort());
          } else {
            assert.equal(entries.length, 10);
            assert.deepEqual(entries.map(e => e.taskId).sort(), taskIds.sort());
          }
        });

        test(`${title} (paginated)`, async function() {
          const entries = [];
          await TaskGroupMemberEntity.scan({
            taskGroupId,
            expires: Entity.op.greaterThanOrEqual(new Date()),
          }, {
            limit: 3,
            handler: e => entries.push(e),
          });

          if (i === 0) {
            // this task group omits the two expired tasks
            assert.equal(entries.length, 8);
            assert.deepEqual(entries.map(e => e.taskId).sort(), taskIds.slice(2, 10).sort());
          } else {
            assert.equal(entries.length, 10);
            assert.deepEqual(entries.map(e => e.taskId).sort(), taskIds.sort());
          }
        });
      };
      tgmScanTest('scan task_group_members for a wholly migrated task group', 0);
      tgmScanTest('scan task_group_members for a partially migrated task group', 10);
      tgmScanTest('scan task_group_members for a new task group', 20);

      test('scan task_group_members for expired entries', async function() {
        const {entries} = await TaskGroupMemberEntity.scan({
          expires: Entity.op.lessThan(new Date()),
        });
        if (expirationScanReturnsNothing) {
          assert.equal(entries.length, 0);
        } else {
          assert.equal(entries.length, 2);
          assert.deepEqual(entries.map(e => e.taskId).sort(), TASK_IDS.slice(0, 2).sort());
        }
      });

      const tgasScanTest = (title, i) => {
        const active = _.range(30).map(j => !!(j & 1));
        if (migratedRowsNotActive) {
          _.range(15).forEach(j => active[j] = false);
        }

        const taskIds = TASK_IDS.slice(i, i + 10);
        const activeTaskIds = active.slice(i, i + 10).map((a, j) => a ? taskIds[j] : undefined).filter(t => t);
        const taskGroupId = taskIds[0];

        test(title, async function() {
          const {entries} = await TaskGroupActiveSetEntity.scan({taskGroupId});
          assert.deepEqual(entries.map(e => e.taskId).sort(), activeTaskIds.sort());
        });

        test(`${title} (paginated)`, async function() {
          const entries = [];
          await TaskGroupActiveSetEntity.scan({taskGroupId}, {
            limit: 3,
            handler: e => entries.push(e),
          });

          assert.deepEqual(entries.map(e => e.taskId).sort(), activeTaskIds.sort());
        });
      };
      tgasScanTest('scan task_group_active_sets for a wholly migrated task group', 0);
      tgasScanTest('scan task_group_active_sets for a partially migrated task group', 10);
      tgasScanTest('scan task_group_active_sets for a new task group', 20);

      test('scan task_group_active_sets for expired entries', async function() {
        const {entries} = await TaskGroupMemberEntity.scan({
          expires: Entity.op.lessThan(new Date()),
        });
        if (expirationScanReturnsNothing) {
          assert.equal(entries.length, 0);
        } else {
          assert.equal(entries.length, 2);
          assert.deepEqual(entries.map(e => e.taskId).sort(), TASK_IDS.slice(0, 2).sort());
        }
      });

      test('remove tasks from active set', async function() {
        const toRemove = [13, 15, 17];
        for (let i of toRemove) {
          await TaskGroupActiveSetEntity.remove({taskGroupId: TASK_IDS[10], taskId: TASK_IDS[i]});
        }

        // leaves only 11 and 19 as active, unless the migraiton marked 11 not active
        const stillActive = migratedRowsNotActive ? [19] : [11, 19];

        const {entries} = await TaskGroupActiveSetEntity.scan({taskGroupId: TASK_IDS[10]});
        assert.deepEqual(entries.map(e => e.taskId).sort(), stillActive.map(i => TASK_IDS[i]).sort());
      });

      test('remove tasks', async function() {
        const taskId = TASK_IDS[10];
        await TaskEntity.remove({taskId}, true);

        const task = await TaskEntity.load({taskId}, true);
        if (taskRemovalNoop) {
          assert.equal(task.taskId, taskId);
        } else {
          assert.equal(task, null);
        }
      });

      test('create tasks', async function() {
        const taskId = taskcluster.slugid();
        const taskGroupId = TASK_IDS[10];
        await TaskEntity.create({
          ...baseTask,
          taskId,
          taskGroupId,
          expires,
        });

        const task = await TaskEntity.load({taskId}, true);
        assert.equal(task.taskId, taskId);

        // create an active set entity just like queue does
        await TaskGroupActiveSetEntity.create({taskId, taskGroupId, expires});

        // and check that this new task looks active
        await TaskGroupActiveSetEntity.load({taskId, taskGroupId});
      });
    });
  };

  // first, test with just the old version
  makeMidMigrationTests('un-migrated (previous version)', async () => {
  }, {
    migratedRowsNotActive: false,
    expirationScanReturnsNothing: false,
    expiredTaskPresent: true,
    taskRemovalNoop: false,
  });

  // then, the new version before anything's happened
  makeMidMigrationTests('no rows migrated', async () => {
    await helper.upgradeTo(THIS_VERSION);
  }, {
    migratedRowsNotActive: false,
    expirationScanReturnsNothing: true,
    expiredTaskPresent: true,
    taskRemovalNoop: true,
  });

  // then, with all entities migrated, but not finished
  makeMidMigrationTests('rows migrated, un-finished', async () => {
    await helper.upgradeTo(THIS_VERSION);
    await driveMigrationToCompletion(false);
  }, {
    migratedRowsNotActive: true,
    expirationScanReturnsNothing: true,
    expiredTaskPresent: false,
    taskRemovalNoop: false,
  });

  // then, with all entities migrated, and finished
  makeMidMigrationTests('rows migrated, finished', async () => {
    await helper.upgradeTo(THIS_VERSION);
    await driveMigrationToCompletion(true);
  }, {
    migratedRowsNotActive: true,
    expirationScanReturnsNothing: true,
    expiredTaskPresent: false,
    taskRemovalNoop: false,
  });

  helper.testEntityTable({
    dbVersion: THIS_VERSION,
    serviceName: 'queue',
    entityTableName: 'queue_tasks_entities',
    newTableName: 'tasks',
    EntityClass: Task,
    samples: {
      untaken: {
        ...baseTask,
        schedulerId: 'untaken',
        taskId: 'U1DhJjLaRDeP9ml-HMClKQ',
        taskGroupId: 'U1DhJjLaRDeP9ml-HMClKQ',
        expires: taskcluster.fromNow('1 day'), // not expired
      },
      taken: {
        ...baseTask,
        schedulerId: 'taken',
        taskId: 'fIYgOS8aS1mIFw6m-uNhVw',
        taskGroupId: 't2QC2Q3nRf68CCU80124bg',
        takenUntil,
      },
      // several other tasks in the same taskGroup
      ...Object.fromEntries(tgTaskIds.map((taskId, i) => ([
        `tg-${i}`, {
          ...baseTask,
          schedulerId: `tg-${i}`,
          taskId,
          taskGroupId: 'FvvdpeGtQW-fCN1K0Fwzbg',
        }]))),
    },
    loadConditions: [
      {condition: {taskId: 'fIYgOS8aS1mIFw6m-uNhVw'}, expectedSample: 'taken'},
      {condition: {taskId: 'U1DhJjLaRDeP9ml-HMClKQ'}, expectedSample: 'untaken'},
    ],
    scanConditions: [
      {condition: {taskId: 'fIYgOS8aS1mIFw6m-uNhVw'}, expectedSamples: ['taken']},
      {condition: {taskId: 'fIYgOS8aS1mIFw6m-uNhVw', takenUntil}, expectedSamples: ['taken']},
      {condition: {taskId: 'fIYgOS8aS1mIFw6m-uNhVw', takenUntil: new Date()}, expectedSamples: []},
      {condition: {taskId: 'U1DhJjLaRDeP9ml-HMClKQ', deadline}, expectedSamples: ['untaken']},
      {condition: {taskId: 'U1DhJjLaRDeP9ml-HMClKQ', deadline: new Date()}, expectedSamples: []},
      /*
       * this differs from version 19 (where it returns something) to an un-migrated version 20
       * (where it does not)
       *
      {condition: {expires: Entity.op.lessThan(new Date())},
        // (these are sorted by taskId)
        expectedSamples: ['tg-0', 'tg-1', 'taken', 'tg-2', 'tg-3', 'tg-4']},
      */
    ],
    notFoundConditions: [
      {condition: {taskId: taskcluster.slugid()}},
    ],
    notImplemented: ['create-overwrite'],
    modifications: [{
      condition: {taskId: tgTaskIds[0]},
      modifier: [
        ent => {
          ent.runs.push({run: true});
          ent.retriesLeft -= 1;
        },
        ent => {
          ent.runs.push({run: true});
          ent.retriesLeft -= 1;
        },
        ent => {
          ent.takenUntil = new Date(1999, 12, 31);
        },
      ],
      checker(ent) {
        assert.deepEqual(ent.runs, [{run: true}, {run: true}]);
        assert.equal(ent.retriesLeft, 3);
        assert.deepEqual(ent.takenUntil, new Date(1999, 12, 31));
      },
    }, {
      condition: {taskId: 'fIYgOS8aS1mIFw6m-uNhVw'},
      modifier: [
        ent => {
          // verify that setting this value to NULL works
          ent.takenUntil = new Date(0);
        },
      ],
      checker(ent) {
        assert.deepEqual(ent.takenUntil, new Date(0));
      },
    }],
  }, function(isThisVersion) {
    let TaskGroupMemberEntity, TaskGroupActiveSetEntity;
    if (!isThisVersion) {
      return;
    }

    suiteSetup(async function() {
      const db = await helper.setupDb('queue');
      TaskGroupMemberEntity = await TaskGroupMember.setup({
        db,
        serviceName: 'test',
        tableName: 'queue_task_group_members_entities',
        monitor: false,
        context: {},
      });
      TaskGroupActiveSetEntity = await TaskGroupActiveSet.setup({
        db,
        serviceName: 'test',
        tableName: 'queue_task_group_active_sets_entities',
        monitor: false,
        context: {},
      });
    });

    // test queue_task_group_members_entities functions, which now read from the tasks table
    test('load a single task group member', async function() {
      const tg = await TaskGroupMemberEntity.load({taskId: 'GXCEcvbRSJeYrKw5XbnOZw', taskGroupId: 'FvvdpeGtQW-fCN1K0Fwzbg'});
      assert.equal(tg.taskId, 'GXCEcvbRSJeYrKw5XbnOZw');
      assert.equal(tg.taskGroupId, 'FvvdpeGtQW-fCN1K0Fwzbg');
      assert.deepEqual(tg.expires, expires);
    });

    test('load a nonexistent task group member', async function() {
      const tg = await TaskGroupMemberEntity.load({taskId: 'YbQcrE37QfuKf9RbhCM7nw', taskGroupId: 'FvvdpeGtQW-fCN1K0Fwzbg'}, true);
      assert.deepEqual(tg, null);
    });

    test('load a member of a nonexistent task group', async function() {
      const tg = await TaskGroupMemberEntity.load({taskId: 'GXCEcvbRSJeYrKw5XbnOZw', taskGroupId: 'YbQcrE37QfuKf9RbhCM7nw'}, true);
      assert.deepEqual(tg, null);
    });

    test('create a member of a task group (no-op)', async function() {
      await TaskGroupMemberEntity.create({taskId: 'GXCEcvbRSJeYrKw5XbnOZw', taskGroupId: 'YbQcrE37QfuKf9RbhCM7nw', expires});
      const tg = await TaskGroupMemberEntity.load({taskId: 'GXCEcvbRSJeYrKw5XbnOZw', taskGroupId: 'YbQcrE37QfuKf9RbhCM7nw'}, true);
      assert.deepEqual(tg, null);
    });

    test('scan all task group members (stubbed to empty)', async function() {
      const tgs = await TaskGroupMemberEntity.scan({expires: Entity.op.lessThan(expires)});
      assert.deepEqual(tgs.entries, []);
    });

    test('scan members of a task group', async function() {
      const tgs = await TaskGroupMemberEntity.query({
        taskGroupId: 'FvvdpeGtQW-fCN1K0Fwzbg',
        expires: Entity.op.greaterThanOrEqual(expires),
      });
      assert.deepEqual(tgs.entries.map(e => e.taskId), tgTaskIds);
    });

    test('scan members of a task group with pagination', async function() {
      const tgs = await TaskGroupMemberEntity.query({
        taskGroupId: 'FvvdpeGtQW-fCN1K0Fwzbg',
        expires: Entity.op.greaterThanOrEqual(expires),
      }, {limit: 1});
      assert.deepEqual(tgs.entries.map(e => e.taskId), tgTaskIds.slice(0, 1));
      assert(tgs.continuation);
    });

    test('scan members of a nonexistent task group', async function() {
      const tgs = await TaskGroupMemberEntity.query({
        taskGroupId: '7X6348O2RuSzNYfMk70xDA',
      });
      assert.deepEqual(tgs.entries, []);
    });

    test('load a single active task group member', async function() {
      const tg = await TaskGroupActiveSetEntity.load({taskId: 'GXCEcvbRSJeYrKw5XbnOZw', taskGroupId: 'FvvdpeGtQW-fCN1K0Fwzbg'});
      assert.equal(tg.taskId, 'GXCEcvbRSJeYrKw5XbnOZw');
      assert.equal(tg.taskGroupId, 'FvvdpeGtQW-fCN1K0Fwzbg');
      assert.deepEqual(tg.expires, expires);
    });

    test('load a nonexistent active task group member', async function() {
      const tg = await TaskGroupActiveSetEntity.load({taskId: 'YbQcrE37QfuKf9RbhCM7nw', taskGroupId: 'FvvdpeGtQW-fCN1K0Fwzbg'}, true);
      assert.deepEqual(tg, null);
    });

    test('load a member of a nonexistent task group (active task sets)', async function() {
      const tg = await TaskGroupActiveSetEntity.load({taskId: 'GXCEcvbRSJeYrKw5XbnOZw', taskGroupId: 'YbQcrE37QfuKf9RbhCM7nw'}, true);
      assert.deepEqual(tg, null);
    });

    test('create an active member of a task group (no-op)', async function() {
      await TaskGroupActiveSetEntity.create({taskId: 'GXCEcvbRSJeYrKw5XbnOZw', taskGroupId: 'YbQcrE37QfuKf9RbhCM7nw', expires});
      const tg = await TaskGroupActiveSetEntity.load({taskId: 'GXCEcvbRSJeYrKw5XbnOZw', taskGroupId: 'YbQcrE37QfuKf9RbhCM7nw'}, true);
      assert.deepEqual(tg, null);
    });

    test('scan all active task group members (stubbed to empty)', async function() {
      const tgs = await TaskGroupActiveSetEntity.scan({expires: Entity.op.lessThan(expires)});
      assert.deepEqual(tgs.entries, []);
    });

    test('scan active members of a task group', async function() {
      const tgs = await TaskGroupActiveSetEntity.query({taskGroupId: 'FvvdpeGtQW-fCN1K0Fwzbg'});
      assert.deepEqual(tgs.entries.map(e => e.taskId), tgTaskIds);
    });

    test('scan omits inactive members of a task group', async function() {
      await TaskGroupActiveSetEntity.remove({taskGroupId: 'FvvdpeGtQW-fCN1K0Fwzbg', taskId: tgTaskIds[0]});
      const tgs = await TaskGroupActiveSetEntity.query({taskGroupId: 'FvvdpeGtQW-fCN1K0Fwzbg'});
      assert.deepEqual(tgs.entries.map(e => e.taskId), tgTaskIds.slice(1));
    });

    test('scan active members of a task group with pagination', async function() {
      const tgs = await TaskGroupActiveSetEntity.query({taskGroupId: 'FvvdpeGtQW-fCN1K0Fwzbg'}, {limit: 1});
      assert.deepEqual(tgs.entries.map(e => e.taskId), tgTaskIds.slice(0, 1));
      assert(tgs.continuation);
    });

    test('scan active members of a nonexistent task group', async function() {
      const tgs = await TaskGroupActiveSetEntity.query({
        taskGroupId: '7X6348O2RuSzNYfMk70xDA',
      });
      assert.deepEqual(tgs.entries, []);
    });
  });
});
