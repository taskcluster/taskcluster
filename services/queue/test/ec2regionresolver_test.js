const assert = require('assert');
const helper = require('./helper');
const nock = require('nock');
const testing = require('taskcluster-lib-testing');
const monitorManager = require('../src/monitor');
const EC2RegionResolver = require('../src/ec2regionresolver');
const {LEVELS} = require('taskcluster-lib-monitor');

suite(testing.suiteName(), function() {
  helper.withAmazonIPRanges(false, () => false);

  let monitor;
  setup(async function() {
    monitor = await helper.load('monitor');
    monitorManager.reset(); // clear the first task-pending message
  });

  const reqWithIp = ip => ({headers: {'x-client-ip': ip}});

  test('newly-constructed state returns null', function() {
    const res = new EC2RegionResolver(['us-west-1'], monitor);
    assert.equal(res.getRegion(reqWithIp('1.2.3.4')), null);
  });

  test('loading ip ranges results in lookups for named regions', async function() {
    const res = new EC2RegionResolver(['us-west-1', 'us-west-2'], monitor);
    res.start();
    try {
      await res.waitForLoad();
      assert.equal(res.getRegion(reqWithIp('50.18.1.2')), 'us-west-1');
      assert.equal(res.getRegion(reqWithIp('18.236.1.2')), 'us-west-2');
      assert.equal(res.getRegion(reqWithIp('52.1.2.3')), null); // us-east-1, not a listed region
    } finally {
      await res.stop();
    }
  });

  test('when loading ip ranges fails, it is retried', async function() {
    nock.cleanAll();

    // fail once, then succeed
    nock('https://ip-ranges.amazonaws.com')
      .get('/ip-ranges.json')
      .reply(500, '{}', {'Content-Type': 'application/json'});

    nock('https://ip-ranges.amazonaws.com')
      .get('/ip-ranges.json')
      .replyWithFile(200, __dirname + '/ip-ranges.json', {'Content-Type': 'application/json'});

    const res = new EC2RegionResolver(['us-west-1', 'us-west-2'], monitor);
    res.start();
    try {
      await res.waitForLoad();
      assert.equal(res.getRegion(reqWithIp('50.18.1.2')), 'us-west-1');
    } finally {
      await res.stop();
      nock.cleanAll();
    }

    assert.deepEqual(monitorManager.messages.find(({Type}) => Type === 'monitor.generic'), {
      Logger: 'taskcluster.queue',
      Type: 'monitor.generic',
      Fields: {message: 'Failed to download AWS IP ranges (retrying): Error: Internal Server Error'},
      Severity: LEVELS.warning,
    });
  });
});
