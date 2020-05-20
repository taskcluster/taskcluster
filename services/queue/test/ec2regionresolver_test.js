const assert = require('assert');
const helper = require('./helper');
const nock = require('nock');
const testing = require('taskcluster-lib-testing');
const EC2RegionResolver = require('../src/ec2regionresolver');
const {LEVELS} = require('taskcluster-lib-monitor');

suite(testing.suiteName(), function() {
  helper.withAmazonIPRanges(false, () => false);

  let monitor;
  setup(async function() {
    monitor = await helper.load('monitor');
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
      await res.waitForFetch();
      // see fake-ip-ranges.json
      assert.equal(res.getRegion(reqWithIp('1.2.3.4')), 'us-west-2');
      assert.equal(res.getRegion(reqWithIp('4.4.4.4')), null); // ap-central-4 is not a listed region
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
      .replyWithFile(200, __dirname + '/fake-ip-ranges.json', {'Content-Type': 'application/json'});

    const res = new EC2RegionResolver(['us-west-1', 'us-west-2'], monitor);
    res.start();
    try {
      // until the fetch completes (500ms), we get cached data
      assert.equal(res.getRegion(reqWithIp('1.2.3.4')), null);
      assert.equal(res.getRegion(reqWithIp('50.18.1.2')), 'us-west-1');

      await res.waitForFetch();

      // and now we get the data in fake-ip-ranges, which is just 1.0.0.0/8 in us-west-2
      assert.equal(res.getRegion(reqWithIp('1.2.3.4')), 'us-west-2');
      assert.equal(res.getRegion(reqWithIp('50.18.1.2')), null);
    } finally {
      await res.stop();
      nock.cleanAll();
    }

    assert.deepEqual(monitor.manager.messages.find(({Type}) => Type === 'monitor.generic'), {
      Logger: 'taskcluster.test',
      Type: 'monitor.generic',
      Fields: {message: 'Failed to download AWS IP ranges (retrying): Error: Internal Server Error'},
      Severity: LEVELS.warning,
    });
  });
});
