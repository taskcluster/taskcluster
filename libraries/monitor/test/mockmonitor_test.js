suite('MockMonitor', () => {
  let assert = require('assert');
  let monitoring = require('../');
  let debug = require('debug')('test');

  let monitor = null;

  setup(async () => {
    monitor = await monitoring({
      project: 'mm',
      credentials: {clientId: 'test-client', accessToken: 'test'},
      mock: true,
    });
  });

  test('should work without prefix', function () {
    monitor.count('test-key');
    assert.deepEqual(monitor.counts, {'mm.test-key': 1});
  });

  test('should work with single prefix', function () {
    let monitor2 = monitor.prefix('single');
    monitor2.count('test-key');
    assert.deepEqual(monitor.counts, {'mm.single.test-key': 1});
  });

  test('should work with double prefix', function () {
    let monitor2 = monitor.prefix('single');
    let monitor3 = monitor2.prefix('double');
    monitor3.count('test-key');
    assert.deepEqual(monitor.counts, {'mm.single.double.test-key': 1});
  });

  test('should record errors', function () {
    monitor.reportError('testing123');
    assert.deepEqual(monitor.errors, ['testing123']);
  });

  test('should capture errors', function () {
    monitor.captureError('testing123');
    assert.deepEqual(monitor.errors, ['testing123']);
  });

  test('should count', function () {
    monitor.count('test-key');
    assert.deepEqual(monitor.counts, {'mm.test-key': 1});
  });

  test('should measure', function () {
    monitor.measure('test-key', 1);
    monitor.measure('test-key', 2);
    monitor.measure('test-key', 3);
    assert.deepEqual(monitor.measures, {'mm.test-key': [1, 2, 3]});
  });

  test('should reject malformed measures', function () {
    assert.throws(() => monitor.measure('a', [1, 2, 3]), Error);
    assert.throws(() => monitor.measure('a', 'bc'), Error);
    assert.throws(() => monitor.measure('a', {b: 2}), Error);
  });
});
