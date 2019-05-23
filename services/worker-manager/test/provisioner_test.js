const assert = require('assert');
const helper = require('./helper');
const testing = require('taskcluster-lib-testing');
const monitorManager = require('../src/monitor');
const {LEVELS} = require('taskcluster-lib-monitor');
const {splitWorkerTypeName} = require('../src/util');

helper.secrets.mockSuite(testing.suiteName(), ['taskcluster', 'azure'], function(mock, skipping) {
  helper.withEntities(mock, skipping);
  helper.withPulse(mock, skipping);
  helper.withFakeNotify(mock, skipping);
  helper.withFakeQueue(mock, skipping);
  helper.withServer(mock, skipping);
  helper.withProvisioner(mock, skipping);

  suite('provisioning loop', function() {
    const testCase = (workerTypes) => {
      return testing.runWithFakeTime(async function() {
        await Promise.all(workerTypes.map(async wt => {
          await helper.workerManager.createWorkerType(wt.workerTypeName, wt.input);
          const {provisionerId, workerType} = splitWorkerTypeName(wt.workerTypeName);
          helper.queue.setPending(provisionerId, workerType, wt.pending);
        }));

        await helper.initiateProvisioner();
        await testing.poll(async () => {
          const error = monitorManager.messages.find(({Type}) => Type === 'monitor.error');
          if (error) {
            throw new Error(JSON.stringify(error, null, 2));
          }
          await Promise.all(workerTypes.map(async wt => {
            assert.deepEqual(
              monitorManager.messages.find(
                msg => msg.Type === 'workertype-provisioned' && msg.Fields.workerTypeName === wt.workerTypeName), {
                Logger: 'taskcluster.worker-manager.provisioner',
                Type: 'workertype-provisioned',
                Fields: {workerTypeName: wt.workerTypeName, providerId: wt.input.providerId, v: 1},
                Severity: LEVELS.info,
              });
          }));
        });
        await helper.terminateProvisioner();
      }, {
        mock,
        maxTime: 30000,
      });
    };

    test('single workertype', testCase([
      {
        workerTypeName: 'pp/ee',
        pending: 1,
        input: {
          providerId: 'testing1',
          description: 'bar',
          config: {},
          owner: 'example@example.com',
          emailOnError: false,
        },
      },
    ]));

    test('multiple workertypes, same provider', testCase([
      {
        workerTypeName: 'pp/ee',
        pending: 1,
        input: {
          providerId: 'testing1',
          description: 'bar',
          config: {},
          owner: 'example@example.com',
          emailOnError: false,
        },
      },
      {
        workerTypeName: 'pp/ee2',
        pending: 100,
        input: {
          providerId: 'testing1',
          description: 'bar',
          config: {},
          owner: 'example@example.com',
          emailOnError: false,
        },
      },
    ]));

    test('multiple workertypes, different provider', testCase([
      {
        workerTypeName: 'pp/ee',
        pending: 1,
        input: {
          providerId: 'testing1',
          description: 'bar',
          config: {},
          owner: 'example@example.com',
          emailOnError: false,
        },
      },
      {
        workerTypeName: 'pp/ee2',
        pending: 100,
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

  suite('workertype exchanges', function() {
    let workerType;
    setup(async function() {
      const now = new Date();
      workerType = await helper.WorkerType.create({
        workerTypeName: 'pp/foo',
        providerId: 'testing1',
        description: 'none',
        scheduledForDeletion: false,
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

    test('workertype created', async function() {
      await helper.fakePulseMessage({
        payload: {
          workerTypeName: 'pp/foo',
          providerId: 'testing1',
        },
        exchange: 'exchange/taskcluster-worker-manager/v1/workertype-created',
        routingKey: 'primary.#',
        routes: [],
      });
      assert.deepEqual(monitorManager.messages.find(msg => msg.Type === 'create-resource'), {
        Logger: 'taskcluster.worker-manager.testing1',
        Type: 'create-resource',
        Severity: LEVELS.notice,
        Fields: {workerTypeName: 'pp/foo'},
      });
    });

    test('workertype modified, same provider', async function() {
      await helper.fakePulseMessage({
        payload: {
          workerTypeName: 'pp/foo',
          providerId: 'testing1',
          previousProviderId: 'testing1',
        },
        exchange: 'exchange/taskcluster-worker-manager/v1/workertype-updated',
        routingKey: 'primary.#',
        routes: [],
      });
      assert.deepEqual(monitorManager.messages.find(msg => msg.Type === 'update-resource'), {
        Logger: 'taskcluster.worker-manager.testing1',
        Type: 'update-resource',
        Severity: LEVELS.notice,
        Fields: {workerTypeName: 'pp/foo'},
      });
    });

    test('workertype modified, different provider', async function() {
      await workerType.modify(wt => {
        wt.providerId = 'testing2';
      });
      await helper.fakePulseMessage({
        payload: {
          workerTypeName: 'pp/foo',
          providerId: 'testing2',
          previousProviderId: 'testing1',
        },
        exchange: 'exchange/taskcluster-worker-manager/v1/workertype-updated',
        routingKey: 'primary.#',
        routes: [],
      });
      assert.deepEqual(monitorManager.messages.find(msg => msg.Type === 'remove-resource'), {
        Logger: 'taskcluster.worker-manager.testing1',
        Type: 'remove-resource',
        Severity: LEVELS.notice,
        Fields: {workerTypeName: 'pp/foo'},
      });
      assert.deepEqual(monitorManager.messages.find(msg => msg.Type === 'create-resource'), {
        Logger: 'taskcluster.worker-manager.testing2',
        Type: 'create-resource',
        Severity: LEVELS.notice,
        Fields: {workerTypeName: 'pp/foo'},
      });
    });

    test('workertype deleted', async function() {
      await helper.fakePulseMessage({
        payload: {
          workerTypeName: 'pp/foo',
          providerId: 'testing1',
        },
        exchange: 'exchange/taskcluster-worker-manager/v1/workertype-deleted',
        routingKey: 'primary.#',
        routes: [],
      });
      assert.deepEqual(monitorManager.messages.find(msg => msg.Type === 'remove-resource'), {
        Logger: 'taskcluster.worker-manager.testing1',
        Type: 'remove-resource',
        Severity: LEVELS.notice,
        Fields: {workerTypeName: 'pp/foo'},
      });
    });
  });
});
