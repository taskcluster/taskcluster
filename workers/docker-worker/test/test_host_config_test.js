const assert = require('assert');
const subject = require('../src/lib/host/test');
const settings = require('./settings');
const libUrls = require('taskcluster-lib-urls');
const {suiteName} = require('taskcluster-lib-testing');

suite(suiteName(), () => {
  setup(settings.cleanup);
  teardown(settings.cleanup);

  test('configure', async () => {
    settings.configure({
      capacity: 2,
      rootUrl: libUrls.testRootUrl(),
    });
    assert.deepEqual(
      {
        capacity: 2,
        publicIp: '127.0.0.1',
        workerNodeType: 'test-worker',
        instanceId: 'test-worker-instance',
        instanceType: 'r3-superlarge',
        privateIp: '169.254.1.1',
        region: 'us-middle-1a',
        rootUrl: libUrls.testRootUrl(),
      },
      subject.configure(),
    );
  });
});
