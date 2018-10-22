const BaseMonitor = require('../src/base');
const assert = require('assert');

class TestMonitor extends BaseMonitor {
  constructor() {
    super();
    this.measures = [];
    this.counts = [];
    this.errors = [];
  }

  measure(prefix, ms) {
    this.measures.push({prefix, ms});
  }

  count(prefix, val) {
    this.counts.push({prefix, val});
  }

  reportError(err) {
    this.errors.push(err);
  }
}

suite('BaseMonitor', function() {
  let monitor;
  setup(function() {
    monitor = new TestMonitor();
  });

  suite('timer', function() {
    const takes100ms = () => new Promise(resolve => setTimeout(() => resolve(13), 100));
    const checkMonitor = (len) => {
      // check this after a short delay, as otherwise the Promise.resolve
      // can measure something after timer returns..
      return new Promise(resolve => setTimeout(resolve, 10)).then(() => {
        assert.equal(monitor.measures.length, len);
        monitor.measures.forEach(m => assert.equal(m.prefix, 'pfx'));
      });
    };

    test('of a sync function', async function() {
      assert.equal(monitor.timer('pfx', () => 13), 13);
      await checkMonitor(1);
    });

    test('of a sync function that fails', async function() {
      assert.throws(() => {
        monitor.timer('pfx', () => { throw new Error('uhoh'); });
      }, /uhoh/);
      await checkMonitor(1);
    });

    test('of an async function', async function() {
      assert.equal(await monitor.timer('pfx', takes100ms), 13);
      await checkMonitor(1);
      assert(monitor.measures[0].ms >= 90);
    });

    test('of an async function that fails', async function() {
      let err;
      try {
        await monitor.timer('pfx', async () => { throw new Error('uhoh'); });
      } catch (e) {
        err = e;
      }
      assert(err && /uhoh/.test(err.message));
      await checkMonitor(1);
    });

    test('of a promise', async function() {
      assert.equal(await monitor.timer('pfx', takes100ms()), 13);
      await checkMonitor(1);
      assert(monitor.measures[0].ms >= 90);
    });

    test('of a failed promise', async function() {
      let err;
      try {
        await monitor.timer('pfx', Promise.reject(new Error('uhoh')));
      } catch (e) {
        err = e;
      }
      assert(err && /uhoh/.test(err.message));
      await checkMonitor(1);
    });
  });

  suite('oneShot', function() {
    const oldExit = process.exit;
    let exitStatus = null;

    suiteSetup('mock exit', function() {
      process.exit = (s) => { exitStatus = s; };
    });

    suiteTeardown('unmock exit', function() {
      process.exit = oldExit;
    });

    setup('clear exitStatus', function() {
      exitStatus = null;
    });

    test('successful async function', async function() {
      await monitor.oneShot('expire', async () => {});
      assert.equal(exitStatus, 0);
      assert.equal(monitor.measures[0].prefix, 'expire.duration');
      assert.equal(monitor.counts[0].prefix, 'expire.done');
      assert.equal(monitor.errors.length, 0);
    });

    test('unsuccessful async function', async function() {
      await monitor.oneShot('expire', async () => { throw new Error('uhoh'); });
      assert.equal(exitStatus, 1);
      assert.equal(monitor.measures[0].prefix, 'expire.duration');
      assert.equal(monitor.counts.length, 0);
      assert(monitor.errors[0].toString().match(/uhoh/), monitor.errors[0]);
    });
  });
});
