const assert = require('assert');
const helper = require('./helper');
const testing = require('taskcluster-lib-testing');

helper.secrets.mockSuite(testing.suiteName(), ['taskcluster'], function(mock, skipping) {
  helper.withEntities(mock, skipping);
  helper.withFakeQueue(mock, skipping);
  helper.withServer(mock, skipping);
  helper.withProvisioner(mock, skipping);

  test('single workertype', async function() {
    const name = 'ee';
    const input = {
      provider: 'foo',
      description: 'bar',
      configTemplate: {},
    };
    await helper.workerManager.createWorkerType(name, input);
    helper.queue.setPending('worker-manager', name, 1);

    await testing.poll(
      async () => {
        assert.deepEqual(helper.monitor.messages.find(({Type}) => Type === 'workertype-provision'), {
          Logger: 'taskcluster.worker-manager.root.provisioner',
          Type: 'workertype-provision',
          Fields: {workertype: name, pending: 1, v: 1},
        });
      },
      10);
  });

});
