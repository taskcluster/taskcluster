const helper = require('./helper');
const AZQueue = require('taskcluster-lib-azqueue');
const testing = require('taskcluster-lib-testing');
const _ = require('lodash');
const taskcluster = require('taskcluster-client');
const assert = require('assert').strict;

helper.secrets.mockSuite(testing.suiteName(), [], function(mock, skipping) {
  helper.withDb(mock, skipping);

  suiteSetup(function() {
    // HINT: run these tests with the following to see explains in the logs:
    //
    // docker run -ti -p 127.0.0.1:5432:5432  --rm postgres:11 \
    //   -c log_statement=all \
    //   -c session_preload_libraries=auto_explain \
    //   -c auto_explain.log_min_duration=0s \
    //   -c auto_explain.log_nested_statements=on \
    //   -c auto_explain.log_analyze=on
    //
    // See below for important things to look for in the explain output.
    //
    // These tests will almost certainly pass; don't bother running them
    // unless you are looking at the explain output.

    // Comment this line out to run these tests.
    this.skip();
  });

  const clearDb = async client => {
    await client.query('delete from azure_queue_messages');
  };

  const fillDb = async (client, { queues, count, visible, inserted }) => {
    await client.query(`create temporary table queues (queue_name text)`);
    for (let queue of queues) {
      await client.query(`insert into queues values ($1)`, [queue]);
    }

    if (!inserted) {
      inserted = new Date();
    }

    if (!visible) {
      visible = taskcluster.fromNow('-1 seconds');
    }

    await client.query(`
      insert into azure_queue_messages (
          queue_name,
          message_id,
          message_text,
          inserted,
          visible,
          expires
        ) select
            queue_name,
            public.gen_random_uuid() as message_id,
            'msg-' || series.i::text as message_text,
            $1 as inserted,
            $2 as visible,
            now () + interval '1 hour' as expires
          from generate_series(0, $3) as series(i), queues
        `, [inserted, visible, count]);
    await client.query(`drop table queues`);
  };

  const analyze = async client => {
    await client.query('analyze');
  };

  // For all of these, we should see an index scan using the .._inserted
  // index.  That index does two things: selects the specific queue (avoiding
  // one huge queue slowing down other queries), and gets messages in the
  // correct FIFO order (avoiding a sort).  We still scan over those messages
  // sequentally to skip any that are invisible or expired.
  //
  // Room for improvement: this currently scans rows looking at visibility
  // and expiration; ideally postgres could do that with an index.  The
  // planner does not do so automatically, probably because of the LIMIT: combining
  // two indexes would require scanning both and creating a bitmap, when in many
  // cases only a partial index scan will be required to satisfy the LIMIT.
  //
  // Critically, we should not see a sort or a sequential scan in the explain.
  //
  // The subquery scan should look something like
  // ->  Limit
  //    ->  LockRows
  //       ->  Index Scan using azure_queue_messages_inserted
  //             Index Cond: (queue_name = 'dependencies'::text)
  //             Filter: ((visible < now()) AND (expires > now()))

  suite('huge queue with visible messages', async function() {
    setup(async function() {
      await helper.db._withClient('write', async client => {
        await clearDb(client);
        await fillDb(client, { queues: ['qq'], count: 100000 });
        await analyze(client);
      });
    });

    test('get from queue', async function() {
      const queue = new AZQueue({ db: helper.db });
      const result = await queue.getMessages('qq', { visibilityTimeout: 10, numberOfMessages: 10 });
      assert.equal(result.length, 10);
    });
  });

  suite('typical high-volume TC install', async function() {
    suiteSetup(async function() {
      // lots of pending-task queues, with lots of tasks in them, filed a while
      // ago
      await helper.db._withClient('write',
        async client => {
          await clearDb(client);
          await fillDb(client, {
            queues: _.range(100).map(q => `q${q}`),
            count: 1000,
            inserted: taskcluster.fromNow('-5 minutes'),
          });

          // claim queue with some invisible messages for running tasks
          await fillDb(client, {
            queues: ['claims'],
            count: 10000,
            visible: taskcluster.fromNow('1 hour'),
            inserted: taskcluster.fromNow('-10 minutes'),
          });

          // deadline queue with some even older invisiblie messages.  Note that
          // deadline messages exist for basically all tasks in the last 5 days.
          await fillDb(client, {
            queues: ['deadlines'],
            count: 100000,
            visible: taskcluster.fromNow('1 hour'),
            inserted: taskcluster.fromNow('-2 hours'),
          });

          // dependencies is a "work queue" with a few visible messages
          // inserted just now
          await fillDb(client, {
            queues: ['dependencies'],
            count: 100,
            inserted: taskcluster.fromNow('0 seconds'),
          });
          await analyze(client);
        });
    });

    test('get pending queue', async function() {
      const queue = new AZQueue({ db: helper.db });
      const result = await queue.getMessages('q79', { visibilityTimeout: 10, numberOfMessages: 10 });
      assert.equal(result.length, 10);
    });

    test('get claim queue', async function() {
      const queue = new AZQueue({ db: helper.db });
      const result = await queue.getMessages('claims', { visibilityTimeout: 10, numberOfMessages: 5 });
      assert.equal(result.length, 0);
    });

    test('get deadline queue', async function() {
      const queue = new AZQueue({ db: helper.db });
      const result = await queue.getMessages('deadlines', { visibilityTimeout: 10, numberOfMessages: 5 });
      assert.equal(result.length, 0);
    });

    test('get dependency queue', async function() {
      const queue = new AZQueue({ db: helper.db });
      const result = await queue.getMessages('dependencies', { visibilityTimeout: 10, numberOfMessages: 5 });
      assert.equal(result.length, 5);
    });
  });
});
