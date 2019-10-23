const assert = require('assert');
const helper = require('./helper');
const testing = require('taskcluster-lib-testing');
const monitorManager = require('../src/monitor');
const {LEVELS} = require('taskcluster-lib-monitor');

helper.secrets.mockSuite(testing.suiteName(), ['azure'], function(mock, skipping) {
  helper.withEntities(mock, skipping);
  helper.withPulse(mock, skipping);
  helper.withFakeNotify(mock, skipping);
  helper.withFakeQueue(mock, skipping);
  helper.withProviders(mock, skipping);
  helper.withServer(mock, skipping);
  helper.withProvisioner(mock, skipping);

  suite('provisioning loop', function() {
    const testCase = (workerPools) => {
      return testing.runWithFakeTime(async function() {
        await Promise.all(workerPools.map(async wt => {
          await helper.workerManager.createWorkerPool(wt.workerPoolId, wt.input);
        }));

        await helper.initiateProvisioner();
        await testing.poll(async () => {
          const error = monitorManager.messages.find(({Type}) => Type === 'monitor.error');
          if (error) {
            throw new Error(JSON.stringify(error, null, 2));
          }
          await Promise.all(workerPools.map(async wt => {
            assert.deepEqual(
              monitorManager.messages.find(
                msg => msg.Type === 'worker-pool-provisioned' && msg.Fields.workerPoolId === wt.workerPoolId), {
                Logger: 'taskcluster.worker-manager.provisioner',
                Type: 'worker-pool-provisioned',
                Fields: {workerPoolId: wt.workerPoolId, providerId: wt.input.providerId, v: 1},
                Severity: LEVELS.info,
              });
            assert.deepEqual(
              monitorManager.messages.find(
                msg => msg.Type === 'test-provision' && msg.Fields.workerPoolId === wt.workerPoolId), {
                Logger: `taskcluster.worker-manager.provider.${wt.input.providerId}`,
                Type: 'test-provision',
                Fields: {workerPoolId: wt.workerPoolId},
                Severity: LEVELS.notice,
              });
          }));
        });
        await helper.terminateProvisioner();
      }, {
        mock,
        maxTime: 30000,
      });
    };

    test('single worker pool', testCase([
      {
        workerPoolId: 'pp/ee',
        input: {
          providerId: 'testing1',
          description: 'bar',
          config: {},
          owner: 'example@example.com',
          emailOnError: false,
        },
      },
    ]));

    test('multiple worker pools, same provider', testCase([
      {
        workerPoolId: 'pp/ee',
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
        input: {
          providerId: 'testing1',
          description: 'bar',
          config: {},
          owner: 'example@example.com',
          emailOnError: false,
        },
      },
    ]));

    test('multiple worker pools, different provider', testCase([
      {
        workerPoolId: 'pp/ee',
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
        input: {
          providerId: 'testing2',
          description: 'bar',
          config: {},
          owner: 'example@example.com',
          emailOnError: false,
        },
      },
    ]));
  });

  suite('worker pool exchanges', function() {
    let workerPool;
    setup(async function() {
      const now = new Date();
      workerPool = await helper.WorkerPool.create({
        workerPoolId: 'pp/foo',
        providerId: 'testing1',
        description: 'none',
        previousProviderIds: [],
        created: now,
        lastModified: now,
        config: {},
        owner: 'whoever@example.com',
        providerData: {},
        emailOnError: false,
      });
      await helper.initiateProvisioner();
    });
    teardown(async function() {
      await helper.terminateProvisioner();
    });

    test('worker pool created', async function() {
      await helper.fakePulseMessage({
        payload: {
          workerPoolId: 'pp/foo',
          providerId: 'testing1',
        },
        exchange: 'exchange/taskcluster-worker-manager/v1/worker-pool-created',
        routingKey: 'primary.#',
        routes: [],
      });
      assert.deepEqual(monitorManager.messages.find(msg => msg.Type === 'create-resource'), {
        Logger: 'taskcluster.worker-manager.provider.testing1',
        Type: 'create-resource',
        Severity: LEVELS.notice,
        Fields: {workerPoolId: 'pp/foo'},
      });
    });

    test('message with unknown provider', async function() {
      await helper.fakePulseMessage({
        payload: {
          workerPoolId: 'pp/foo',
          providerId: 'no-such-provider',
        },
        exchange: 'exchange/taskcluster-worker-manager/v1/worker-pool-created',
        routingKey: 'primary.#',
        routes: [],
      });
      assert.deepEqual(monitorManager.messages.find(msg => msg.Type === 'create-resource'), undefined);
    });

    test('worker pool modified, same provider', async function() {
      await helper.fakePulseMessage({
        payload: {
          workerPoolId: 'pp/foo',
          providerId: 'testing1',
          previousProviderId: 'testing1',
        },
        exchange: 'exchange/taskcluster-worker-manager/v1/worker-pool-updated',
        routingKey: 'primary.#',
        routes: [],
      });
      assert.deepEqual(monitorManager.messages.find(msg => msg.Type === 'update-resource'), {
        Logger: 'taskcluster.worker-manager.provider.testing1',
        Type: 'update-resource',
        Severity: LEVELS.notice,
        Fields: {workerPoolId: 'pp/foo'},
      });
    });

    test('worker pool modified, different provider', async function() {
      await workerPool.modify(wt => {
        wt.providerId = 'testing2';
      });
      await helper.fakePulseMessage({
        payload: {
          workerPoolId: 'pp/foo',
          providerId: 'testing2',
          previousProviderId: 'testing1',
        },
        exchange: 'exchange/taskcluster-worker-manager/v1/worker-pool-updated',
        routingKey: 'primary.#',
        routes: [],
      });
      assert.deepEqual(monitorManager.messages.find(msg => msg.Type === 'create-resource'), {
        Logger: 'taskcluster.worker-manager.provider.testing2',
        Type: 'create-resource',
        Severity: LEVELS.notice,
        Fields: {workerPoolId: 'pp/foo'},
      });
    });
  });

  suite('provision', function() {
    test('provision scan provisions a worker pool', async function() {
      await helper.WorkerPool.create({
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
      });
      const provisioner = await helper.load('provisioner');
      await provisioner.provision();
      assert.deepEqual(
        monitorManager.messages.find(
          msg => msg.Type === 'worker-pool-provisioned' && msg.Fields.workerPoolId === 'pp/ww'), {
          Logger: 'taskcluster.worker-manager.provisioner',
          Type: 'worker-pool-provisioned',
          Fields: {workerPoolId: 'pp/ww', providerId: 'testing1', v: 1},
          Severity: LEVELS.info,
        });
    });

    test('provision scan skips worker pools with unknown providerId', async function() {
      await helper.WorkerPool.create({
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
      });
      const provisioner = await helper.load('provisioner');
      await provisioner.provision();
      assert.deepEqual(
        monitorManager.messages.find(
          msg => msg.Type === 'worker-pool-provisioned' && msg.Fields.workerPoolId === 'pp/ww'),
        undefined);
      assert.deepEqual(
        monitorManager.messages.find(msg => msg.Type === 'monitor.generic'), {
          Logger: 'taskcluster.worker-manager.provisioner',
          Type: 'monitor.generic',
          Fields: {message: 'Worker pool pp/ww has unknown providerId NO-SUCH'},
          Severity: LEVELS.warning,
        });
    });

    test('provision scan skips worker pools with unknown previous providerId', async function() {
      await helper.WorkerPool.create({
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
      });
      const provisioner = await helper.load('provisioner');
      await provisioner.provision();
      assert.deepEqual(
        monitorManager.messages.find(
          msg => msg.Type === 'worker-pool-provisioned' && msg.Fields.workerPoolId === 'pp/ww'), {
          Logger: 'taskcluster.worker-manager.provisioner',
          Type: 'worker-pool-provisioned',
          Fields: {workerPoolId: 'pp/ww', providerId: 'testing1', v: 1},
          Severity: LEVELS.info,
        });
      assert.deepEqual(
        monitorManager.messages.find(msg => msg.Type === 'monitor.generic'), {
          Logger: 'taskcluster.worker-manager.provisioner',
          Type: 'monitor.generic',
          Fields: {message: 'Worker pool pp/ww has unknown previousProviderIds entry NO-SUCH (ignoring)'},
          Severity: LEVELS.info,
        });
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
        monitorManager.messages.find(
          msg => msg.Type === 'test-provision' && msg.Fields.workerPoolId === workerPool.workerPoolId), {
          Logger: `taskcluster.worker-manager.provider.${workerPool.input.providerId}`,
          Type: 'test-provision',
          Fields: {workerPoolId: workerPool.workerPoolId},
          Severity: LEVELS.notice,
        });

      await monitorManager.reset(); // So we can assert there is no provisioning message this time
      workerPool.input.providerId = 'null-provider';
      await helper.workerManager.updateWorkerPool(workerPool.workerPoolId, workerPool.input);
      await provisioner.provision();

      assert(!monitorManager.messages.find(msg => msg.Type === 'test-provision'));
      assert.deepEqual(
        monitorManager.messages.find(
          msg => msg.Type === 'test-deprovision' && msg.Fields.workerPoolId === workerPool.workerPoolId), {
          Logger: 'taskcluster.worker-manager.provider.testing1', // This is the old providerId
          Type: 'test-deprovision',
          Fields: {workerPoolId: workerPool.workerPoolId},
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
        monitorManager.messages.find(
          msg => msg.Type === 'test-provision' && msg.Fields.workerPoolId === workerPool.workerPoolId), {
          Logger: `taskcluster.worker-manager.provider.${workerPool.input.providerId}`,
          Type: 'test-provision',
          Fields: {workerPoolId: workerPool.workerPoolId},
          Severity: LEVELS.notice,
        });

      await monitorManager.reset(); // So we can assert there is no provisioning message this time
      workerPool.input.providerId = 'testing2';
      await helper.workerManager.updateWorkerPool(workerPool.workerPoolId, workerPool.input);
      await provisioner.provision();

      assert(!monitorManager.messages.find(msg => msg.Type === 'test-provision' && msg.Logger.endsWith('testing1')));
      assert.deepEqual(
        monitorManager.messages.find(
          msg => msg.Type === 'test-deprovision' && msg.Fields.workerPoolId === workerPool.workerPoolId), {
          Logger: 'taskcluster.worker-manager.provider.testing1', // This is the old providerId
          Type: 'test-deprovision',
          Fields: {workerPoolId: workerPool.workerPoolId},
          Severity: LEVELS.notice,
        });
      assert.deepEqual(
        monitorManager.messages.find(
          msg => msg.Type === 'test-provision' && msg.Fields.workerPoolId === workerPool.workerPoolId), {
          Logger: `taskcluster.worker-manager.provider.${workerPool.input.providerId}`,
          Type: 'test-provision',
          Fields: {workerPoolId: workerPool.workerPoolId},
          Severity: LEVELS.notice,
        });
    });
  });
});
