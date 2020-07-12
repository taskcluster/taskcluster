const _ = require('lodash');
const taskcluster = require('taskcluster-client');
const helper = require('../helper');
const testing = require('taskcluster-lib-testing');
const assert = require('assert');
const Entity = require('taskcluster-lib-entities');

const THIS_VERSION = parseInt(/.*\/0*(\d+)_test\.js/.exec(__filename)[1]);
const PREV_VERSION = THIS_VERSION - 1;

// (adapted from services/queue/src/data.js) NOTE: this will be
// removed when tc-lib-entities is dropped from the repository
let TaskDependency = Entity.configure({
  version: 1,
  partitionKey: Entity.keys.StringKey('taskId'),
  rowKey: Entity.keys.StringKey('dependentTaskId'),
  properties: {
    taskId: Entity.types.SlugId,
    dependentTaskId: Entity.types.SlugId,
    require: Entity.types.String,
    expires: Entity.types.Date,
  },
});

let TaskRequirement = Entity.configure({
  version: 1,
  partitionKey: Entity.keys.StringKey('taskId'),
  rowKey: Entity.keys.StringKey('requiredTaskId'),
  properties: {
    taskId: Entity.types.SlugId,
    requiredTaskId: Entity.types.SlugId,
    expires: Entity.types.Date,
  },
});

suite(testing.suiteName(), function() {
  helper.withDbForVersion();

  test('tables created / removed on upgrade and downgrade', async function() {
    await testing.resetDb({testDbUrl: helper.dbUrl});
    await helper.upgradeTo(PREV_VERSION);

    await helper.assertTable('queue_task_dependency_entities');
    await helper.assertTable('queue_task_requirement_entities');
    await helper.assertNoTable('task_dependencies');

    await helper.upgradeTo(THIS_VERSION);
    await helper.assertNoTable('queue_task_dependency_entities');
    await helper.assertNoTable('queue_task_requirement_entities');
    await helper.assertTable('task_dependencies');

    await helper.downgradeTo(PREV_VERSION);
    await helper.assertTable('queue_task_dependency_entities');
    await helper.assertTable('queue_task_requirement_entities');
    await helper.assertNoTable('task_dependencies');
  });

  const expires = taskcluster.fromNow('-1 day');
  const future = taskcluster.fromNow('1 day');
  const taskIds = {
    // note that these are in order by taskId in the en_US.UTF8 collation
    a: 'd7s6bYFSR6Wfa7UnMtf7sQ',
    b: 'lez9Io6gSTKEw0kgiY0DoA',
    c: 'ou6umhGETTavDGoa4zxFCQ',
    d: 'VAclMez2TYu2RqHdCvBjXA',
    e: 'Yt8uD46tTlGEdry0dK-X9g',
  };

  // the Entity classes are both backed by the same Postgres table, but
  // function independently.  The additional tests verify functionality where
  // they interact.

  helper.testEntityTable({
    dbVersion: THIS_VERSION,
    serviceName: 'queue',
    entityTableName: 'queue_task_dependency_entities',
    newTableName: 'task_dependencies',
    EntityClass: TaskDependency,
    samples: {
      aDepB: {
        taskId: taskIds.a,
        dependentTaskId: taskIds.b,
        require: 'completed',
        expires,
      },
      aDepC: {
        taskId: taskIds.a,
        dependentTaskId: taskIds.c,
        require: 'resolved',
        expires,
      },
      bDepD: {
        taskId: taskIds.b,
        dependentTaskId: taskIds.d,
        require: 'completed',
        expires,
      },
      eDepB: {
        taskId: taskIds.e,
        dependentTaskId: taskIds.b,
        require: 'completed',
        expires: future,
      },
    },
    loadConditions: [
      {condition: {taskId: taskIds.a, dependentTaskId: taskIds.b}, expectedSample: 'aDepB'},
      {condition: {taskId: taskIds.a, dependentTaskId: taskIds.c}, expectedSample: 'aDepC'},
    ],
    scanConditions: [
      {condition: {}, expectedSamples: ['aDepB', 'aDepC', 'bDepD', 'eDepB']},
      {condition: {taskId: taskIds.a}, expectedSamples: ['aDepB', 'aDepC']},
      {condition: {taskId: taskIds.b}, expectedSamples: ['bDepD']},
      {condition: {expires: Entity.op.lessThan(new Date())}, expectedSamples: ['aDepB', 'aDepC', 'bDepD']},
    ],
    notFoundConditions: [
      {condition: {taskId: taskIds.a, dependentTaskId: taskIds.d}},
    ],
    notImplemented: ['create-overwrite'],
    modifications: [],
  });

  helper.testEntityTable({
    dbVersion: THIS_VERSION,
    serviceName: 'queue',
    entityTableName: 'queue_task_requirement_entities',
    newTableName: 'task_dependencies',
    EntityClass: TaskRequirement,
    samples: {
      aDepB: {
        taskId: taskIds.b,
        requiredTaskId: taskIds.a,
        expires,
      },
      aDepC: {
        taskId: taskIds.c,
        requiredTaskId: taskIds.a,
        expires,
      },
      bDepD: {
        taskId: taskIds.d,
        requiredTaskId: taskIds.b,
        expires,
      },
      eDepB: {
        taskId: taskIds.b,
        requiredTaskId: taskIds.e,
        expires: future,
      },
    },
    loadConditions: [
      {condition: {taskId: taskIds.b, requiredTaskId: taskIds.a}, expectedSample: 'aDepB'},
      {condition: {taskId: taskIds.c, requiredTaskId: taskIds.a}, expectedSample: 'aDepC'},
    ],
    scanConditions: [
      {condition: {}, expectedSamples: ['aDepB', 'eDepB', 'aDepC', 'bDepD']},
      {condition: {taskId: taskIds.b}, expectedSamples: ['aDepB', 'eDepB']},
      {condition: {taskId: taskIds.c}, expectedSamples: ['aDepC']},
      {condition: {taskId: taskIds.e}, expectedSamples: []},
    ],
    notFoundConditions: [
      {condition: {taskId: taskIds.a, requiredTaskId: taskIds.d}},
    ],
    notImplemented: ['create-overwrite'],
    modifications: [],
  }, function(isThisVersion) {
    let TaskDependencyEntity;
    let TaskRequirementEntity;
    if (!isThisVersion) {
      return;
    }

    suiteSetup(async function() {
      const db = await helper.setupDb('queue');
      TaskDependencyEntity = await TaskDependency.setup({
        db,
        serviceName: 'test',
        tableName: 'queue_task_dependency_entities',
        monitor: false,
        context: {},
      });
      TaskRequirementEntity = await TaskRequirement.setup({
        db,
        serviceName: 'test',
        tableName: 'queue_task_requirement_entities',
        monitor: false,
        context: {},
      });
    });

    test('TaskRequirement.scan for expiration returns nothing', async function() {
      const tgs = await TaskRequirementEntity.scan({expires: Entity.op.lessThan(expires)});
      assert.deepEqual(tgs.entries, []);
    });

    test('TaskRequirement.create followed by TaskDependency.create, then remove', async function() {
      let td, result;

      await TaskRequirementEntity.create({
        taskId: taskIds.d,
        requiredTaskId: taskIds.a,
        expires,
      });

      await TaskDependencyEntity.create({
        taskId: taskIds.a,
        dependentTaskId: taskIds.d,
        require: 'resolved',
        expires,
      });

      td = await TaskDependencyEntity.load({taskId: taskIds.a, dependentTaskId: taskIds.d});
      assert.deepEqual(td.taskId, taskIds.a);
      assert.deepEqual(td.dependentTaskId, taskIds.d);
      assert.deepEqual(td.require, 'resolved');

      td = await TaskRequirementEntity.load({taskId: taskIds.d, requiredTaskId: taskIds.a}, true);
      assert.deepEqual(td.taskId, taskIds.d);
      assert.deepEqual(td.requiredTaskId, taskIds.a);

      await TaskRequirementEntity.remove({
        taskId: taskIds.d,
        requiredTaskId: taskIds.a,
      });

      td = await TaskRequirementEntity.load({taskId: taskIds.d, requiredTaskId: taskIds.a}, true);
      assert.equal(td, null);

      result = await TaskRequirementEntity.query({taskId: taskIds.d}, true);
      assert.equal(result.entries.length, 1); // bDepD , and not the dDepA created above
      assert.equal(result.entries[0].taskId, taskIds.d);
      assert.equal(result.entries[0].requiredTaskId, taskIds.b);

      td = await TaskDependencyEntity.load({taskId: taskIds.a, dependentTaskId: taskIds.d});
      assert.deepEqual(td.taskId, taskIds.a);
      assert.deepEqual(td.dependentTaskId, taskIds.d);
      assert.deepEqual(td.require, 'resolved');

      await TaskDependencyEntity.remove({
        taskId: taskIds.a,
        dependentTaskId: taskIds.d,
      });

      td = await TaskDependencyEntity.load({taskId: taskIds.a, dependentTaskId: taskIds.d}, true);
      assert.equal(td, null);
    });

    test('TaskDependency.create followed by TaskRequirement.create', async function() {
      let td;

      await TaskDependencyEntity.create({
        taskId: taskIds.a,
        dependentTaskId: taskIds.d,
        require: 'resolved',
        expires,
      });

      td = await TaskRequirementEntity.load({taskId: taskIds.d, requiredTaskId: taskIds.a}, true);
      assert.equal(td, null);

      await TaskRequirementEntity.create({
        taskId: taskIds.d,
        requiredTaskId: taskIds.a,
        expires,
      });

      td = await TaskDependencyEntity.load({taskId: taskIds.a, dependentTaskId: taskIds.d});
      assert.deepEqual(td.taskId, taskIds.a);
      assert.deepEqual(td.dependentTaskId, taskIds.d);
      assert.deepEqual(td.require, 'resolved');

      td = await TaskRequirementEntity.load({taskId: taskIds.d, requiredTaskId: taskIds.a}, true);
      assert.deepEqual(td.taskId, taskIds.d);
      assert.deepEqual(td.requiredTaskId, taskIds.a);
    });
  });
});
