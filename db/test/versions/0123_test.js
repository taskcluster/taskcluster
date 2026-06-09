import assert from 'assert';
import helper from '../helper.js';
import testing from '@taskcluster/lib-testing';
import taskcluster from '@taskcluster/client';

const THIS_VERSION = parseInt(/.*\/0*(\d+)_test\.js/.exec(import.meta.url)[1]);
const PREV_VERSION = THIS_VERSION - 1;

suite(testing.suiteName(), function() {
  helper.withDbForVersion();

  test('migration deduplicates deadline rows and enforces task_id uniqueness', async function() {
    await testing.resetDb({ testDbUrl: helper.dbUrl });
    await helper.upgradeTo(PREV_VERSION);

    const deadline = taskcluster.fromNow('1 hour');
    const visible = taskcluster.fromNow('1 hour');

    await helper.withDbClient(async client => {
      for (let i = 0; i < 3; i++) {
        await client.query(
          `insert into queue_task_deadlines
             (task_group_id, task_id, scheduler_id, created, deadline, visible)
           values ($1, $2, $3, now() + ($4 || ' microseconds')::interval, $5, $6)`,
          ['tg', 't1', 's', i, deadline, visible],
        );
      }
      await client.query(
        `insert into queue_task_deadlines
           (task_group_id, task_id, scheduler_id, created, deadline, visible)
         values ($1, $2, $3, now(), $4, $5)`,
        ['tg', 't2', 's', deadline, visible],
      );

      const { rows: before } = await client.query(
        'select task_id from queue_task_deadlines order by task_id, created');
      assert.equal(before.filter(r => r.task_id === 't1').length, 3);
      assert.equal(before.filter(r => r.task_id === 't2').length, 1);
    });

    await helper.upgradeTo(THIS_VERSION);

    await helper.withDbClient(async client => {
      const { rows } = await client.query(
        'select task_id from queue_task_deadlines order by task_id');
      assert.deepEqual(rows.map(r => r.task_id), ['t1', 't2']);

      await assert.rejects(
        () => client.query(
          `insert into queue_task_deadlines
             (task_group_id, task_id, scheduler_id, created, deadline, visible)
           values ($1, $2, $3, now(), $4, $5)`,
          ['tg', 't1', 's', deadline, visible],
        ),
        err => err.code === '23505',
      );
    });
  });

  test('migration deduplicates rows with identical (created, deadline)', async function() {
    await testing.resetDb({ testDbUrl: helper.dbUrl });
    await helper.upgradeTo(PREV_VERSION);

    const created = taskcluster.fromNow('0 seconds');
    const deadline = taskcluster.fromNow('1 hour');
    const visible = taskcluster.fromNow('1 hour');

    await helper.withDbClient(async client => {
      // Temporarily drop the existing PK so we can seed identical-tuple rows;
      // the 0123 migration rewrites the primary key anyway.
      await client.query(
        'alter table queue_task_deadlines drop constraint queue_task_deadlines_pkey');

      for (let i = 0; i < 3; i++) {
        await client.query(
          `insert into queue_task_deadlines
             (task_group_id, task_id, scheduler_id, created, deadline, visible)
           values ($1, $2, $3, $4, $5, $6)`,
          ['tg', 't1', 's', created, deadline, visible],
        );
      }

      const { rows: before } = await client.query(
        'select task_id from queue_task_deadlines');
      assert.equal(before.length, 3);
    });

    await helper.upgradeTo(THIS_VERSION);

    await helper.withDbClient(async client => {
      const { rows } = await client.query(
        'select task_id from queue_task_deadlines');
      assert.deepEqual(rows.map(r => r.task_id), ['t1']);

      await assert.rejects(
        () => client.query(
          `insert into queue_task_deadlines
             (task_group_id, task_id, scheduler_id, created, deadline, visible)
           values ($1, $2, $3, now(), $4, $5)`,
          ['tg', 't1', 's', deadline, visible],
        ),
        err => err.code === '23505',
      );
    });
  });

  test('downgrade restores the previous primary key', async function() {
    await testing.resetDb({ testDbUrl: helper.dbUrl });
    await helper.upgradeTo(THIS_VERSION);
    await helper.downgradeTo(PREV_VERSION);

    const deadline = taskcluster.fromNow('1 hour');
    const visible = taskcluster.fromNow('1 hour');

    // This should allow dupes again
    await helper.withDbClient(async client => {
      for (let i = 0; i < 2; i++) {
        await client.query(
          `insert into queue_task_deadlines
             (task_group_id, task_id, scheduler_id, created, deadline, visible)
           values ($1, $2, $3, now() + ($4 || ' microseconds')::interval, $5, $6)`,
          ['tg', 't1', 's', i, deadline, visible],
        );
      }
      const { rows } = await client.query(
        'select task_id from queue_task_deadlines where task_id = $1', ['t1']);
      assert.equal(rows.length, 2);
    });
  });
});
