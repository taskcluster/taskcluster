const ShutdownManager = require('../src/lib/shutdown_manager');
const assert = require('assert').strict;
const monitor = require('./fixtures/monitor');
const Debug = require('debug');
const {suiteName} = require('taskcluster-lib-testing');

const log = Debug('log');

suite(suiteName(), function() {
  const host = {
    billingCycleUptime() {
      return 13;
    },
  };

  const makeConfig = (overrides = {}) => ({
    monitor,
    log,
    ...overrides,
  });

  test('should not exit by default', function() {
    const sm = new ShutdownManager(host, makeConfig());
    assert.equal(sm.shouldExit(), false);
  });

  test('immediate exit on SIGTERM', function() {
    const sm = new ShutdownManager(host, makeConfig());
    process.emit('SIGTERM');
    assert.equal(sm.shouldExit(), 'immediate');
  });

  test('immediate exit on graceful-termination without finish-tasks', function() {
    const sm = new ShutdownManager(host, makeConfig());
    sm.onGracefulTermination(false);
    assert.equal(sm.shouldExit(), 'immediate');
  });

  test('graceful exit on graceful-termination without finish-tasks', function() {
    const sm = new ShutdownManager(host, makeConfig());
    sm.onGracefulTermination(true);
    assert.equal(sm.shouldExit(), 'graceful');
  });

  test('onIdle does nothing with no config', async function() {
    const sm = new ShutdownManager(host, makeConfig());
    sm.onIdle();
    assert.equal(sm.shouldExit(), false);
  });

  test('onIdle does nothing if not enabled', async function() {
    const sm = new ShutdownManager(host, makeConfig({
      shutdown: {enabled: false},
    }));
    sm.onIdle();
    assert.equal(sm.shouldExit(), false);
  });

  test('onIdle starts a timer, exits graceful', async function() {
    const sm = new ShutdownManager(host, makeConfig({
      shutdown: {enabled: true, afterIdleSeconds: 0.01},
    }));
    sm.onIdle();
    assert.equal(sm.shouldExit(), false);
    await new Promise(res => setTimeout(res, 50));
    assert.equal(sm.shouldExit(), 'graceful');
  });

  test('onWorking cancels timer', async function() {
    const sm = new ShutdownManager(host, makeConfig({
      shutdown: {enabled: true, afterIdleSeconds: 0.05},
    }));
    sm.onIdle();
    assert.equal(sm.shouldExit(), false);
    assert(sm.idleTimeout);
    await new Promise(res => setTimeout(res, 10));
    sm.onWorking();
    assert(!sm.idleTimeout);
    assert.equal(sm.shouldExit(), false);
    await new Promise(res => setTimeout(res, 50));
    assert.equal(sm.shouldExit(), false);
  });

  test('_setExit will not downgrade', function() {
    const sm = new ShutdownManager(host, makeConfig());
    sm.exit = 'immediate';
    sm._setExit('graceful');
    assert.equal(sm.shouldExit(), 'immediate');
  });
});
