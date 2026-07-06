import assert from 'node:assert';
import testing from '@taskcluster/lib-testing';
import helper from './helper.js';
import { Worker } from '../src/data.js';

helper.secrets.mockSuite(testing.suiteName(), [], (mock, skipping) => {
  helper.withDb(mock, skipping);
  helper.resetTables();

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

  suite('worker.update', () => {
    test('worker.update', async () => {
      const worker = await createWorker();
      await worker.update(helper.db, worker => {
        worker.capacity = 2;
        worker.providerId = 'updated';
      });

      assert.equal(worker.capacity, 2);
      assert.equal(worker.providerId, 'updated');
    });

    test('worker.update (concurrent)', async () => {
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
