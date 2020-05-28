const assert = require('assert');
const helper = require('./helper');
const testing = require('taskcluster-lib-testing');
const {Worker} = require('../src/data');

helper.secrets.mockSuite(testing.suiteName(), ['db'], function(mock, skipping) {
  helper.withDb(mock, skipping);
  helper.withEntities(mock, skipping);
  helper.resetTables(mock, skipping);

  suite('worker.update', function() {
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
