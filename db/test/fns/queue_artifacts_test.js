const assert = require('assert').strict;
const testing = require('taskcluster-lib-testing');
const { UNIQUE_VIOLATION } = require('taskcluster-lib-postgres');
const slugid = require('slugid');
const _ = require('lodash');
const helper = require('../helper');
const taskcluster = require('taskcluster-client');

suite(testing.suiteName(), function() {
  helper.withDbForProcs({ serviceName: 'queue' });

  setup('reset table', async function() {
    await helper.withDbClient(async client => {
      await client.query('delete from queue_artifacts');
    });
  });

  helper.dbTest('create_queue_artifact returns the artifact', async function(db) {
    const now = new Date();
    const taskId = slugid.nice();
    const [artifact] = await db.fns.create_queue_artifact(
      taskId,
      0,
      'name',
      'storage-type',
      'content-type',
      {},
      false,
      now,
    );
    assert.equal(artifact.task_id, taskId);
    assert.equal(artifact.run_id, 0);
    assert.equal(artifact.name, 'name');
    assert.equal(artifact.storage_type, 'storage-type');
    assert.equal(artifact.content_type, 'content-type');
    assert.deepEqual(artifact.details, {});
    assert.equal(artifact.present, false);
    assert.equal(artifact.expires.toJSON(), now.toJSON());
  });

  helper.dbTest('create_queue_artifact throws when row exists', async function(db) {
    const taskId = slugid.nice();
    await db.fns.create_queue_artifact(
      taskId,
      0,
      'name',
      'storage-type',
      'content-type',
      {},
      false,
      new Date(),
    );
    await assert.rejects(
      async () => {
        await db.fns.create_queue_artifact(
          taskId,
          0,
          'name',
          'storage-type',
          'content-type',
          {},
          false,
          new Date(),
        );
      },
      err => err.code === UNIQUE_VIOLATION,
    );
  });

  helper.dbTest('update_queue_artifacts can update expires and details', async function(db) {
    const taskId = slugid.nice();
    await db.fns.create_queue_artifact(
      taskId,
      0,
      'name',
      'storage-type',
      'content-type',
      {},
      false,
      new Date(),
    );
    const [artifact] = await db.fns.update_queue_artifact(taskId, 0, 'name', { details: 'updated' }, new Date(2));

    assert.equal(artifact.task_id, taskId);
    assert.equal(artifact.run_id, 0);
    assert.equal(artifact.storage_type, 'storage-type');
    assert.equal(artifact.content_type, 'content-type');
    assert.deepEqual(artifact.details, { details: 'updated' });
    assert.equal(artifact.present, false);
    assert.equal(artifact.expires.toJSON(), new Date(2).toJSON());
  });

  helper.dbTest('update_queue_artifact no changes to expires and details', async function(db) {
    const taskId = slugid.nice();
    const now = new Date();
    await db.fns.create_queue_artifact(
      taskId,
      0,
      'name',
      'storage-type',
      'content-type',
      {},
      false,
      now,
    );
    const [artifact] = await db.fns.update_queue_artifact(taskId, 0, 'name', {}, now);

    assert.equal(artifact.task_id, taskId);
    assert.equal(artifact.run_id, 0);
    assert.equal(artifact.name, 'name');
    assert.equal(artifact.storage_type, 'storage-type');
    assert.equal(artifact.content_type, 'content-type');
    assert.deepEqual(artifact.details, {});
    assert.equal(artifact.present, false);
    assert.equal(artifact.expires.toJSON(), now.toJSON());
  });

  helper.dbTest('get_queue_artifact gets an artifact', async function(db) {
    const taskId = slugid.nice();
    const now = new Date();
    await db.fns.create_queue_artifact(
      taskId,
      0,
      'name',
      'storage-type',
      'content-type',
      {},
      false,
      now,
    );
    const [artifact] = await db.fns.get_queue_artifact(taskId, 0, 'name');
    assert.equal(artifact.task_id, taskId);
    assert.equal(artifact.run_id, 0);
    assert.equal(artifact.name, 'name');
    assert.equal(artifact.storage_type, 'storage-type');
    assert.equal(artifact.content_type, 'content-type');
    assert.deepEqual(artifact.details, {});
    assert.equal(artifact.present, false);
    assert.equal(artifact.expires.toJSON(), now.toJSON());
  });

  helper.dbTest('get_queue_artifact does not throw when not found', async function(db) {
    const taskId = slugid.nice();
    const [artifact] = await db.fns.get_queue_artifact(taskId, 0, 'name');
    assert(!artifact, 'expected no artifact');
  });

  helper.dbTest('get_queue_artifacts empty', async function(db) {
    const rows = await db.fns.get_queue_artifacts(null, null, null, null, null);
    assert.deepEqual(rows, []);
  });

  helper.dbTest('get_queue_artifacts full, pagination', async function(db) {
    const now = new Date();
    const taskId = slugid.nice();
    for (let i = 0; i < 10; i++) {
      await db.fns.create_queue_artifact(
        taskId,
        i,
        `name-${i}`,
        'storage-type',
        'content-type',
        {},
        false,
        now,
      );
    }

    let rows = await db.fns.get_queue_artifacts(null, null, null, null, null);
    assert.deepEqual(
      rows.map(r => ({ task_id: r.task_id, run_id: r.run_id, name: r.name })),
      _.range(10).map(i => ({ task_id: taskId, run_id: i, name: `name-${i}` })));
    assert.equal(rows[0].storage_type, 'storage-type');
    assert.equal(rows[0].content_type, 'content-type');
    assert.deepEqual(rows[0].details, {});
    assert.equal(rows[0].present, false);
    assert.deepEqual(rows[0].expires, now);

    rows = await db.fns.get_queue_artifacts(null, null, null, 2, 4);
    assert.deepEqual(
      rows.map(r => ({ task_id: r.task_id, run_id: r.run_id, name: r.name })),
      [4, 5].map(i => ({ task_id: taskId, run_id: i, name: `name-${i}` })));
  });

  helper.dbTest('get_queue_artifacts full, pagination filtered by task_id and run_id', async function(db) {
    const now = new Date();
    const taskId = slugid.nice();
    for (let i = 0; i < 10; i++) {
      await db.fns.create_queue_artifact(
        taskId,
        0,
        `name-${i}`,
        'storage-type',
        'content-type',
        {},
        false,
        now,
      );
    }

    let rows = await db.fns.get_queue_artifacts(taskId, 0, null, null, null);
    assert.deepEqual(
      rows.map(r => ({ task_id: r.task_id, run_id: r.run_id, name: r.name })),
      _.range(10).map(i => ({ task_id: taskId, run_id: 0, name: `name-${i}` })));
    assert.equal(rows[0].storage_type, 'storage-type');
    assert.equal(rows[0].content_type, 'content-type');
    assert.deepEqual(rows[0].details, {});
    assert.equal(rows[0].present, false);
    assert.deepEqual(rows[0].expires, now);

    rows = await db.fns.get_queue_artifacts(taskId, 0, null, 2, 4);
    assert.deepEqual(
      rows.map(r => ({ task_id: r.task_id, run_id: r.run_id, name: r.name })),
      [4, 5].map(i => ({ task_id: taskId, run_id: 0, name: `name-${i}` })));
  });

  helper.dbTest('get_queue_artifacts_paginated empty', async function(db) {
    const rows = await db.fns.get_queue_artifacts_paginated({
      task_id_in: null,
      run_id_in: null,
      expires_in: null,
      page_size_in: null,
      after_task_id_in: null,
      after_run_id_in: null,
      after_name_in: null,
    });
    assert.deepEqual(rows, []);
  });

  helper.dbTest('get_queue_artifacts_paginated full, pagination', async function(db) {
    const now = new Date();
    const expected = [];
    const taskIds = [
      // note that these are in the order the DB will return them
      'Bu0WoDk0QXyzK4BZ1WaEUQ',
      'FLEF6ZHVSnyh3-xuZqsiNw',
      'GhNlwWaTREKJ_VRmebtZlA',
      'HH66wFFIRemybJM57XDVOA',
      'HHtpvqTjSD2w3fXcxredXQ',
      'JvZb8QTLThuGejByynboTg',
      'M0cId91WRaiXAVoTPIapaA',
      'OmAAmx6kQduXo5cia9UioQ',
      'RH2ugTjiS1qfb-3XnkcswA',
      'XEqGQJ6_STyLMDTU1-F2Jw',
    ];
    for (let taskId of taskIds) {
      for (let runId = 0; runId < 3; runId++) {
        for (let name = 0; name < 5; name++) {
          name = `name/${name}`;
          expected.push([taskId, runId, name]);
          await db.fns.create_queue_artifact(
            taskId,
            runId,
            name,
            'storage-type',
            'content-type',
            {},
            false,
            now,
          );
        }
      }
    }

    // several different ways of fetching the entire set of rows; if
    // perTaskId is true, a separate paginated request is made for each
    // taskId.
    const fetchInPages = ({ page_size_in, perTaskId }) => {
      return async () => {
        let allRows = [];
        for (let task_id_in of perTaskId ? taskIds : [null]) {
          let lastRow = null;
          while (true) {
            const rows = await db.fns.get_queue_artifacts_paginated({
              task_id_in,
              run_id_in: null,
              expires_in: null,
              page_size_in,
              after_task_id_in: lastRow ? lastRow.task_id : null,
              after_run_id_in: lastRow ? lastRow.run_id : null,
              after_name_in: lastRow ? lastRow.name : null,
            });
            if (rows.length === 0) {
              break;
            }
            lastRow = rows[rows.length - 1];
            allRows = allRows.concat(rows);
          }
        }

        return allRows;
      };
    };

    const fetches = [
      // fetch with no pagination
      async () => {
        return await db.fns.get_queue_artifacts_paginated({
          task_id_in: null,
          run_id_in: null,
          expires_in: null,
          page_size_in: null,
          after_task_id_in: null,
          after_run_id_in: null,
          after_name_in: null,
        });
      },

      // fetch in pages of various sizes to catch boundary conditions
      fetchInPages({ page_size_in: 1 }),
      fetchInPages({ page_size_in: 1, perTaskId: true }),
      fetchInPages({ page_size_in: 2 }),
      fetchInPages({ page_size_in: 3 }),
      fetchInPages({ page_size_in: 3, perTaskId: true }),
      fetchInPages({ page_size_in: 4 }),
      fetchInPages({ page_size_in: 4, perTaskId: true }),
      fetchInPages({ page_size_in: 5 }),
      fetchInPages({ page_size_in: 6 }),
      fetchInPages({ page_size_in: 10 }),
    ];

    for (let fetch of fetches) {
      let rows = await fetch();
      assert.deepEqual(
        rows.map(({ task_id, run_id, name }) => ([task_id, run_id, name])),
        expected);
      for (let row of rows) {
        assert.equal(row.storage_type, 'storage-type');
        assert.equal(row.content_type, 'content-type');
        assert.deepEqual(row.details, {});
        assert.equal(row.present, false);
        assert.deepEqual(row.expires, now);
      }
    }
  });

  helper.dbTest('get_queue_artifacts_paginated full, filtered by task_id and run_id', async function(db) {
    const now = new Date();
    const taskId = slugid.nice();
    for (let i = 0; i < 10; i++) {
      await db.fns.create_queue_artifact(
        taskId,
        0,
        `name-${i}`,
        'storage-type',
        'content-type',
        {},
        false,
        now,
      );
    }

    let rows = await db.fns.get_queue_artifacts_paginated({
      task_id_in: taskId,
      run_id_in: 0,
      expires_in: null,
      page_size_in: null,
      after_task_id_in: null,
      after_run_id_in: null,
      after_name_in: null,
    });
    assert.deepEqual(
      rows.map(r => ({ task_id: r.task_id, run_id: r.run_id, name: r.name })),
      _.range(10).map(i => ({ task_id: taskId, run_id: 0, name: `name-${i}` })));
    assert.equal(rows[0].storage_type, 'storage-type');
    assert.equal(rows[0].content_type, 'content-type');
    assert.deepEqual(rows[0].details, {});
    assert.equal(rows[0].present, false);
    assert.deepEqual(rows[0].expires, now);

    rows = await db.fns.get_queue_artifacts_paginated({
      task_id_in: taskId,
      run_id_in: 0,
      expires_in: null,
      page_size_in: 2,
      after_task_id_in: taskId,
      after_run_id_in: 0,
      after_name_in: 'name-3',
    });
    assert.deepEqual(
      rows.map(r => ({ task_id: r.task_id, run_id: r.run_id, name: r.name })),
      [4, 5].map(i => ({ task_id: taskId, run_id: 0, name: `name-${i}` })));
  });

  helper.dbTest('get_queue_artifacts_paginated get expired tasks', async function(db) {
    const yesterday = taskcluster.fromNow('-1 day');
    const tomorrow = taskcluster.fromNow('1 day');
    const today = new Date();
    const taskId = slugid.nice();
    for (let i = 0; i < 10; i++) {
      await db.fns.create_queue_artifact(
        taskId,
        i,
        `name-${i}`,
        'storage-type',
        'content-type',
        {},
        false,
        (i & 1) ? tomorrow : yesterday,
      );
    }

    let rows = await db.fns.get_queue_artifacts_paginated({
      task_id_in: null,
      run_id_in: null,
      expires_in: today,
      page_size_in: null,
      after_task_id_in: null,
      after_run_id_in: null,
      after_name_in: null,
    });
    assert.deepEqual(rows.map(({ run_id }) => run_id), [0, 2, 4, 6, 8]);
  });

  helper.dbTest('delete_queue_artifact can delete an artifact', async function(db) {
    const taskId = slugid.nice();
    const now = new Date();
    await db.fns.create_queue_artifact(
      taskId,
      0,
      'name',
      'storage-type',
      'content-type',
      {},
      false,
      now,
    );
    await db.fns.delete_queue_artifact(taskId, 0, 'name');
    const [artifact] = await db.fns.get_queue_artifact(taskId, 0, 'name');
    assert(!artifact);
  });

  helper.dbTest('delete_queue_artifact does not throw when artifact not found', async function(db) {
    const taskId = slugid.nice();
    await db.fns.delete_queue_artifact(taskId, 0, 'name');
  });
});
