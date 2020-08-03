const assert = require('assert');
const testing = require('taskcluster-lib-testing');
const helper = require('./helper');
const _ = require('lodash');
const {Worker} = require('../src/data');

helper.secrets.mockSuite(testing.suiteName(), [], function(mock, skipping) {
  helper.withDb(mock, skipping);
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
});
