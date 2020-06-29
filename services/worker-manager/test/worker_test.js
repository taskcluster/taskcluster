const assert = require('assert');
const testing = require('taskcluster-lib-testing');
const helper = require('./helper');
const _ = require('lodash');
const {Worker} = require('../src/data');

helper.secrets.mockSuite(testing.suiteName(), ['db'], function(mock, skipping) {
  helper.withDb(mock, skipping);
  helper.withEntities(mock, skipping);
  helper.resetTables(mock, skipping);

  const defaultWorker = {
    workerPoolId: 'wp',
    workerGroup: 'wg',
    workerId: 'wi',
    capacity: 1,
    providerId: 'pi',
  };
  // create a test worker directly in the DB
  const createWorker = overrides => {
    const worker = Worker.fromApi({ ...defaultWorker, ...overrides });
    return worker.create(helper.db);
  };

  const createWorkers = async n => {
    return Promise.all(_.range(n).map(i => {
      return createWorker({
        workerPoolId: `wp/${i}`,
        workerGroup: `wg/${i}`,
        workerId: `wi/${i}`,
        state: i % 2 === 0 ? 'running' : 'requested',
      });
    }));
  };

  suite('worker.update', function() {
    test('worker.update', async function() {
      const worker = await createWorker();
      await worker.update(helper.db, worker => {
        worker.capacity = 2;
        worker.providerId = 'updated';
      });

      assert.equal(worker.capacity, 2);
      assert.equal(worker.providerId, 'updated');
    });

    test('worker.update (concurrent)', async function() {
      // worker.capacity defaults to 1
      const worker = await createWorker();
      await Promise.all([
        worker.update(helper.db, worker => {
          worker.capacity += 1;
        }),
        worker.update(helper.db, worker => {
          worker.capacity += 1;
        }),
      ]);

      assert.equal(worker.capacity, 3);
    });
  });

  suite('Worker.getWorkers', function() {
    test('no workers available', async function() {
      const workers = await Worker.getWorkers(helper.db, {});

      assert.equal(workers.rows.length, 0);
      assert(!workers.continuationToken);
    });
    test('get all workers', async function() {
      await createWorkers(10);
      const workers = await Worker.getWorkers(helper.db, {});

      assert.equal(workers.rows.length, 10);
      assert(!workers.continuationToken);
    });
    test('get all workers via handler', async function() {
      let count = 0;
      let workerPoolIds = [];
      await createWorkers(10);
      // will have to go through 5 pages
      const query = { limit: 2 };
      await Worker.getWorkers(helper.db, {}, {
        query,
        handler: worker => {
          count += 1;
          workerPoolIds.push(worker.workerPoolId);
        },
      });

      assert.equal(count, 10);
      _.range(10).forEach(i => {
        assert(workerPoolIds.includes(`wp/${i}`));
      });
    });
    test('get a subset of workers via handler', async function() {
      let count = 0;
      await createWorkers(10);
      // will have to go through 5 pages
      const query = { limit: 2 };
      await Worker.getWorkers(helper.db, { state: 'running' }, {
        query,
        handler: worker => {
          count += 1;
          assert.equal(worker.state, 'running');
        },
      });

      assert.equal(count, 5);
    });
  });
});
