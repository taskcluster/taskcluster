const assert = require('assert');
const Promise = require('bluebird');
const monitoring = require('../');
const debug = require('debug')('test');
const libUrls = require('taskcluster-lib-urls');
const testing = require('taskcluster-lib-testing');

suite('MockMonitor', () => {
  let monitor = null;

  setup(async () => {
    monitor = await monitoring({
      rootUrl: libUrls.testRootUrl(),
      projectName: 'mm',
      credentials: {clientId: 'test-client', accessToken: 'test'},
      mock: true,
    });
  });

  test('should work without prefix', function() {
    monitor.count('test-key');
    assert.deepEqual(monitor.counts, {'mm.test-key': 1});
  });

  test('should work with single prefix', function() {
    const monitor2 = monitor.prefix('single');
    monitor2.count('test-key');
    assert.deepEqual(monitor.counts, {'mm.single.test-key': 1});
  });

  test('should work with double prefix', function() {
    const monitor2 = monitor.prefix('single');
    const monitor3 = monitor2.prefix('double');
    monitor3.count('test-key');
    assert.deepEqual(monitor.counts, {'mm.single.double.test-key': 1});
  });

  test('should record errors', function() {
    monitor.reportError('testing123');
    assert.deepEqual(monitor.errors, ['testing123']);
  });

  test('should capture errors', function() {
    monitor.captureError('testing123');
    assert.deepEqual(monitor.errors, ['testing123']);
  });

  test('should count', function() {
    monitor.count('test-key');
    assert.deepEqual(monitor.counts, {'mm.test-key': 1});
  });

  test('should measure', function() {
    monitor.measure('test-key', 1);
    monitor.measure('test-key', 2);
    monitor.measure('test-key', 3);
    assert.deepEqual(monitor.measures, {'mm.test-key': [1, 2, 3]});
  });

  test('should reject malformed measures', function() {
    assert.throws(() => monitor.measure('a', [1, 2, 3]), Error);
    assert.throws(() => monitor.measure('a', 'bc'), Error);
    assert.throws(() => monitor.measure('a', {b: 2}), Error);
  });

  test('should monitor resource usage', async function() {
    const stopMonitor = monitor.resources('testing', 1/500);
    return testing.poll(async () => {
      assert.notEqual(monitor.measures['mm.process.testing.cpu'], undefined);
      assert(monitor.measures['mm.process.testing.cpu'].length > 1);
      assert(monitor.measures['mm.process.testing.mem'].length > 1);
      stopMonitor();
    });
  });

  test('monitor.timer(k, value)', async () => {
    const v = monitor.timer('k', 45);
    assert(v == 45);
    // Sleep so that the promise handler can be handled before we check that
    // something was recorded...
    await new Promise(accept => setTimeout(accept, 10));
    assert(monitor.measures['mm.k'].length === 1);
  });

  test('monitor.timer(k, () => value)', async () => {
    const v = monitor.timer('k', () => 45);
    assert(v == 45);
    await new Promise(accept => setTimeout(accept, 10));
    assert(monitor.measures['mm.k'].length === 1);
  });

  test('monitor.timer(k, async () => value)', async () => {
    const v = await monitor.timer('k', async () => {
      await new Promise(accept => setTimeout(accept, 100));
      return 45;
    });
    assert(v == 45);
    await new Promise(accept => setTimeout(accept, 10));
    assert(monitor.measures['mm.k'].length === 1);
  });

  test('monitor.timer(k, () => {throw new Error()})', async () => {
    try {
      monitor.timer('k', () => {throw new Error();});
    } catch (err) {
      await new Promise(accept => setTimeout(accept, 10));
      assert(monitor.measures['mm.k'].length === 1);
      return;
    }
    assert(false);
  });

  test('monitor.timeKeeper', async () => {
    const doodad = monitor.timeKeeper('doodadgood');
    doodad.measure();
    assert(monitor.measures['mm.doodadgood'].length === 1);
  });

  test('monitor.timeKeeper forced double submit', async () => {
    const doodad = monitor.timeKeeper('doodadgood');
    doodad.measure();
    doodad.measure(true);
    assert(monitor.measures['mm.doodadgood'].length === 2);
  });

  test('monitor.timeKeeper unforced double submit throws', async () => {
    const doodad = monitor.timeKeeper('doodadgood');
    doodad.measure();
    try {
      doodad.measure();
    } catch (err) {
      return;
    }
    assert(false);
  });

  test('monitor.patchAWS(service)', async () => {
    const aws = require('aws-sdk');
    const ec2 = new aws.EC2({
      region: 'us-west-2',
      credentials: new aws.Credentials('akid', 'fake', 'session'),
    });
    monitor.patchAWS(ec2);
    await ec2.describeAvailabilityZones().promise().catch(err => {
      debug('Ignored ec2 error, we measure duration, not success, err: ', err);
    });
    let data = monitor.measures['mm.ec2.global.describeAvailabilityZones.duration'];
    assert(data.length === 1);
    data = monitor.measures['mm.ec2.us-west-2.describeAvailabilityZones.duration'];
    assert(data.length === 1);
    data = monitor.counts['mm.ec2.global.describeAvailabilityZones.count'];
    assert(data === 1);
    data = monitor.counts['mm.ec2.us-west-2.describeAvailabilityZones.count'];
    assert(data === 1);
  });
});
