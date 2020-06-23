const _ = require('lodash');
const taskcluster = require('taskcluster-client');
const helper = require('../helper');
const testing = require('taskcluster-lib-testing');
const assert = require('assert').strict;
const Entity = require('taskcluster-lib-entities');

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
  const deadline = new Date(2021, 1, 1);
  const expires = taskcluster.fromNow('-1 day');
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
      {condition: {expires: Entity.op.lessThan(new Date())},
        // (these are sorted by taskId)
        expectedSamples: ['tg-0', 'tg-1', 'taken', 'tg-2', 'tg-3', 'tg-4']},
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
