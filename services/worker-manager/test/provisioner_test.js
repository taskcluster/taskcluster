const assert = require('assert');
const helper = require('./helper');
const testing = require('taskcluster-lib-testing');
const taskcluster = require('taskcluster-client');
const { LEVELS } = require('taskcluster-lib-monitor');
const { WorkerPool, Worker } = require('../src/data');
const { ApiError } = require('../src/providers/provider');

helper.secrets.mockSuite(testing.suiteName(), [], function(mock, skipping) {
  helper.withDb(mock, skipping);
  helper.withPulse(mock, skipping);
  helper.withFakeNotify(mock, skipping);
  helper.withFakeQueue(mock, skipping);
  helper.withProviders(mock, skipping);
  helper.withServer(mock, skipping);
  helper.withProvisioner(mock, skipping);
  helper.resetTables(mock, skipping);

  let monitor;
  suiteSetup(async function() {
    monitor = await helper.load('monitor');
  });

  suite('provisioning loop', function() {
    const testCase = async ({ workers = [], workerPools = [], assertion, expectErrors = false }) => {
      await Promise.all(workers.map(async w => {
        const worker = Worker.fromApi(w);
        await worker.create(helper.db);
        if (w.quarantineUntil) {
          await helper.withAdminDbClient(async client => {
            await client.query(`insert
              into queue_workers
              (task_queue_id, worker_group, worker_id, recent_tasks, quarantine_until, expires, first_claim, last_date_active) values
              ($1, $2, $3, jsonb_build_array(), $4, now() + interval '1 hour', now() - interval '1 hour', now())`,
            [w.workerPoolId, w.workerGroup, w.workerId, w.quarantineUntil]);
          });
        }
      }));
      await Promise.all(workerPools.map(async wp => {
        if (wp.input) {
          await helper.workerManager.createWorkerPool(wp.workerPoolId, wp.input);
        } else {
          const workerPool = WorkerPool.fromApi(wp);
          await workerPool.create(helper.db);
        }
      }));
      await helper.initiateProvisioner();
      await testing.poll(async () => {
        if (!expectErrors) {
          const error = monitor.manager.messages.find(({ Type }) => Type === 'monitor.error');
          if (error) {
            throw new Error(JSON.stringify(error, null, 2));
          }
        }
        await Promise.all(workerPools.map(async wp => {
          const pId = wp.providerId || wp.input.providerId;
          assert.deepEqual(
            monitor.manager.messages.find(
              msg => msg.Type === 'worker-pool-provisioned' && msg.Fields.workerPoolId === wp.workerPoolId), {
              Logger: 'taskcluster.test.provisioner',
              Type: 'worker-pool-provisioned',
              Fields: { workerPoolId: wp.workerPoolId, providerId: pId, v: 1 },
              Severity: LEVELS.info,
            });
          const msg = monitor.manager.messages.find(
            msg => msg.Type === 'test-provision' && msg.Fields.workerPoolId === wp.workerPoolId);
          assert.deepEqual(msg, {
            Logger: `taskcluster.test.provider.${pId}`,
            Type: 'test-provision',
            Fields: {
              workerPoolId: wp.workerPoolId,
              workerInfo: {
                existingCapacity: wp.existingCapacity,
                requestedCapacity: msg.Fields.workerInfo.requestedCapacity,
              },
            },
            Severity: LEVELS.notice,
          });
        }));
        if (assertion) {
          await assertion();
        }
      });
      await helper.terminateProvisioner();
      if (expectErrors) {
        monitor.manager.reset();
      }
    };

    test('single worker pool', () => testCase({
      workerPools: [
        {
          workerPoolId: 'pp/ee',
          existingCapacity: 0,
          input: {
            providerId: 'testing1',
            description: 'bar',
            config: {},
            owner: 'example@example.com',
            emailOnError: false,
          },
        },
      ],
    }));

    test('single worker pool (with running worker)', () => testCase({
      workers: [
        {
          workerPoolId: 'ff/ee',
          workerGroup: 'whatever',
          workerId: 'testing-OLD',
          providerId: 'testing1',
          created: new Date(),
          lastModified: new Date(),
          lastChecked: new Date(),
          expires: taskcluster.fromNow('1 hour'),
          capacity: 1,
          state: Worker.states.RUNNING,
          providerData: {},
        },
      ],
      workerPools: [
        {
          workerPoolId: 'ff/ee',
          existingCapacity: 1,
          input: {
            providerId: 'testing1',
            description: 'bar',
            config: {},
            owner: 'example@example.com',
            emailOnError: false,
          },
        },
      ],
    }));

    test('single worker pool (with quarantined worker)', () => testCase({
      workers: [
        {
          workerPoolId: 'ff/ee',
          workerGroup: 'whatever',
          workerId: 'testing-OLD',
          providerId: 'testing1',
          created: new Date(),
          lastModified: new Date(),
          lastChecked: new Date(),
          expires: taskcluster.fromNow('1 hour'),
          capacity: 1,
          state: Worker.states.RUNNING,
          providerData: {},
          quarantineUntil: taskcluster.fromNow('1 hour'),
        },
      ],
      workerPools: [
        {
          workerPoolId: 'ff/ee',
          existingCapacity: 0, // quarantined worker is not considered "existing"
          input: {
            providerId: 'testing1',
            description: 'bar',
            config: {},
            owner: 'example@example.com',
            emailOnError: false,
          },
        },
      ],
    }));

    test('multiple worker pools, same provider', () => testCase({
      workerPools: [
        {
          workerPoolId: 'pp/ee',
          existingCapacity: 0,
          input: {
            providerId: 'testing1',
            description: 'bar',
            config: {},
            owner: 'example@example.com',
            emailOnError: false,
          },
        },
        {
          workerPoolId: 'pp/ee2',
          existingCapacity: 0,
          input: {
            providerId: 'testing1',
            description: 'bar',
            config: {},
            owner: 'example@example.com',
            emailOnError: false,
          },
        },
      ],
    }));

    test('multiple worker pools, different provider', () => testCase({
      workerPools: [
        {
          workerPoolId: 'pp/ee',
          existingCapacity: 0,
          input: {
            providerId: 'testing1',
            description: 'bar',
            config: {},
            owner: 'example@example.com',
            emailOnError: false,
          },
        },
        {
          workerPoolId: 'pp/ee2',
          existingCapacity: 0,
          input: {
            providerId: 'testing2',
            description: 'bar',
            config: {},
            owner: 'example@example.com',
            emailOnError: false,
          },
        },
      ],
    }));

    test('worker for previous provider is stopped', () => testCase({
      workers: [
        {
          workerPoolId: 'ff/ee',
          existingCapacity: 0,
          workerGroup: 'whatever',
          workerId: 'testing-OLD',
          providerId: 'testing1',
          created: new Date(),
          lastModified: new Date(),
          lastChecked: new Date(),
          expires: taskcluster.fromNow('1 hour'),
          capacity: 1,
          state: Worker.states.STOPPED,
          providerData: {},
        },
        {
          workerPoolId: 'ff/ee',
          existingCapacity: 0,
          workerGroup: 'whatever',
          workerId: 'testing-123',
          providerId: 'testing2',
          created: new Date(),
          lastModified: new Date(),
          lastChecked: new Date(),
          expires: taskcluster.fromNow('1 hour'),
          capacity: 1,
          state: Worker.states.REQUESTED,
          providerData: {},
        },
      ],
      workerPools: [
        {
          workerPoolId: 'ff/ee',
          existingCapacity: 1,
          providerId: 'testing2',
          previousProviderIds: ['testing1'],
          description: '',
          created: taskcluster.fromNow('-1 hour'),
          lastModified: taskcluster.fromNow('-1 hour'),
          config: {},
          owner: 'foo@example.com',
          emailOnError: false,
          providerData: {},
        },
      ],
      expectErrors: true,
      assertion: async () => {
        const wp = await WorkerPool.get(helper.db, 'ff/ee');
        assert.deepEqual(wp.previousProviderIds, []);
      },
    }));
  });

  suite('provision', function() {
    test('provision scan provisions a worker pool', async function() {
      await WorkerPool.fromApi({
        workerPoolId: 'pp/ww',
        providerId: 'testing1',
        previousProviderIds: [],
        description: '',
        created: new Date(),
        lastModified: new Date(),
        config: {},
        owner: 'me@example.com',
        emailOnError: false,
        providerData: {},
      }).create(helper.db);
      const provisioner = await helper.load('provisioner');
      await provisioner.provision();
      assert.deepEqual(
        monitor.manager.messages.find(
          msg => msg.Type === 'worker-pool-provisioned' && msg.Fields.workerPoolId === 'pp/ww'), {
          Logger: 'taskcluster.test.provisioner',
          Type: 'worker-pool-provisioned',
          Fields: { workerPoolId: 'pp/ww', providerId: 'testing1', v: 1 },
          Severity: LEVELS.info,
        });
    });

    test('provision scan skips worker pools with unknown providerId', async function() {
      await WorkerPool.fromApi({
        workerPoolId: 'pp/ww',
        providerId: 'NO-SUCH',
        previousProviderIds: [],
        description: '',
        created: new Date(),
        lastModified: new Date(),
        config: {},
        owner: 'me@example.com',
        emailOnError: false,
        providerData: {},
      }).create(helper.db);
      const provisioner = await helper.load('provisioner');
      await provisioner.provision();
      assert.deepEqual(
        monitor.manager.messages.find(
          msg => msg.Type === 'worker-pool-provisioned' && msg.Fields.workerPoolId === 'pp/ww'),
        undefined);
      assert.deepEqual(
        monitor.manager.messages.find(msg => msg.Type === 'monitor.generic'), {
          Logger: 'taskcluster.test.provisioner',
          Type: 'monitor.generic',
          Fields: { message: 'Worker pool pp/ww has unknown providerId NO-SUCH' },
          Severity: LEVELS.warning,
        });
    });

    test('provision scan skips worker pools with unknown previous providerId', async function() {
      await WorkerPool.fromApi({
        workerPoolId: 'pp/ww',
        providerId: 'testing1',
        previousProviderIds: ['NO-SUCH'],
        description: '',
        created: new Date(),
        lastModified: new Date(),
        config: {},
        owner: 'me@example.com',
        emailOnError: false,
        providerData: {},
      }).create(helper.db);
      const provisioner = await helper.load('provisioner');
      await provisioner.provision();
      assert.deepEqual(
        monitor.manager.messages.find(
          msg => msg.Type === 'worker-pool-provisioned' && msg.Fields.workerPoolId === 'pp/ww'), {
          Logger: 'taskcluster.test.provisioner',
          Type: 'worker-pool-provisioned',
          Fields: { workerPoolId: 'pp/ww', providerId: 'testing1', v: 1 },
          Severity: LEVELS.info,
        });
      assert.deepEqual(
        monitor.manager.messages.find(msg => msg.Type === 'monitor.generic'), {
          Logger: 'taskcluster.test.provisioner',
          Type: 'monitor.generic',
          Fields: { message: 'Worker pool pp/ww has unknown previousProviderIds entry NO-SUCH (ignoring)' },
          Severity: LEVELS.info,
        });
    });

    test("provision loop is not running in parallel", async function() {
      await WorkerPool.fromApi({
        workerPoolId: 'pp/ww',
        providerId: 'testing1',
        previousProviderIds: ['NO-SUCH'],
        description: '',
        created: new Date(),
        lastModified: new Date(),
        config: {},
        owner: 'me@example.com',
        emailOnError: false,
        providerData: {},
      }).create(helper.db);
      const provisioner = await helper.load('provisioner');

      await assert.rejects(async () => {
        await Promise.all([
          provisioner.provision(),
          provisioner.provision(),
        ]);
      }, new ApiError('provision loop interference'));

      assert.deepEqual(
        monitor.manager.messages.find(msg => msg.Type === 'loop-interference'), {
          Fields: {},
          Logger: 'taskcluster.test.provisioner',
          Severity: 1,
          Type: 'loop-interference',
        });
      monitor.manager.reset();
    });
  });

  suite('deprovisioning loop', function() {
    test('create and destroy', async function() {
      const workerPool = {
        workerPoolId: 'pp/ee',
        input: {
          providerId: 'testing1',
          description: 'bar',
          config: {},
          owner: 'example@example.com',
          emailOnError: false,
        },
      };
      await helper.workerManager.createWorkerPool(workerPool.workerPoolId, workerPool.input);
      const provisioner = await helper.load('provisioner');
      await provisioner.provision();
      assert.deepEqual(
        monitor.manager.messages.find(
          msg => msg.Type === 'test-provision' && msg.Fields.workerPoolId === workerPool.workerPoolId), {
          Logger: `taskcluster.test.provider.${workerPool.input.providerId}`,
          Type: 'test-provision',
          Fields: {
            workerPoolId: workerPool.workerPoolId,
            workerInfo: {
              existingCapacity: 0,
              requestedCapacity: 0,
            },
          },
          Severity: LEVELS.notice,
        });

      await monitor.manager.reset(); // So we can assert there is no provisioning message this time
      workerPool.input.providerId = 'null-provider';
      await helper.workerManager.updateWorkerPool(workerPool.workerPoolId, workerPool.input);
      await provisioner.provision();

      assert(!monitor.manager.messages.find(msg => msg.Type === 'test-provision'));
      assert.deepEqual(
        monitor.manager.messages.find(
          msg => msg.Type === 'test-deprovision' && msg.Fields.workerPoolId === workerPool.workerPoolId), {
          Logger: 'taskcluster.test.provider.testing1', // This is the old providerId
          Type: 'test-deprovision',
          Fields: { workerPoolId: workerPool.workerPoolId },
          Severity: LEVELS.notice,
        });
    });

    test('create and change', async function() {
      const workerPool = {
        workerPoolId: 'pp/ee',
        input: {
          providerId: 'testing1',
          description: 'bar',
          config: {},
          owner: 'example@example.com',
          emailOnError: false,
        },
      };
      await helper.workerManager.createWorkerPool(workerPool.workerPoolId, workerPool.input);
      const provisioner = await helper.load('provisioner');
      await provisioner.provision();
      assert.deepEqual(
        monitor.manager.messages.find(
          msg => msg.Type === 'test-provision' && msg.Fields.workerPoolId === workerPool.workerPoolId), {
          Logger: `taskcluster.test.provider.${workerPool.input.providerId}`,
          Type: 'test-provision',
          Fields: {
            workerPoolId: workerPool.workerPoolId,
            workerInfo: {
              existingCapacity: 0,
              requestedCapacity: 0,
            },
          },
          Severity: LEVELS.notice,
        });

      await monitor.manager.reset(); // So we can assert there is no provisioning message this time
      workerPool.input.providerId = 'testing2';
      await helper.workerManager.updateWorkerPool(workerPool.workerPoolId, workerPool.input);
      await provisioner.provision();

      assert(!monitor.manager.messages.find(msg => msg.Type === 'test-provision' && msg.Logger.endsWith('testing1')));
      assert.deepEqual(
        monitor.manager.messages.find(
          msg => msg.Type === 'test-deprovision' && msg.Fields.workerPoolId === workerPool.workerPoolId), {
          Logger: 'taskcluster.test.provider.testing1', // This is the old providerId
          Type: 'test-deprovision',
          Fields: { workerPoolId: workerPool.workerPoolId },
          Severity: LEVELS.notice,
        });
      assert.deepEqual(
        monitor.manager.messages.find(
          msg => msg.Type === 'test-provision' && msg.Fields.workerPoolId === workerPool.workerPoolId), {
          Logger: `taskcluster.test.provider.${workerPool.input.providerId}`,
          Type: 'test-provision',
          Fields: {
            workerPoolId: workerPool.workerPoolId,
            workerInfo: {
              existingCapacity: 0,
              requestedCapacity: 0,
            },
          },
          Severity: LEVELS.notice,
        });
    });
  });
});
