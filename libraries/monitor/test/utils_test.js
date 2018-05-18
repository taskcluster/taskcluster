const utils = require('../src/utils.js');
const assert = require('assert');

suite('utils', function() {
  suite('timer', function() {
    let monitor;

    setup(function() {
      monitor = {
        measure: (prefix, ms) => monitor.measures.push({prefix, ms}),
        measures: [],
      };
    });

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
      assert.equal(utils.timer(monitor, 'pfx', () => 13), 13);
      await checkMonitor(1);
    });

    test('of a sync function that fails', async function() {
      assert.throws(() => {
        utils.timer(monitor, 'pfx', () => { throw new Error('uhoh'); });
      }, /uhoh/);
      await checkMonitor(1);
    });

    test('of an async function', async function() {
      assert.equal(await utils.timer(monitor, 'pfx', takes100ms), 13);
      await checkMonitor(1);
      assert(monitor.measures[0].ms >= 90);
    });

    test('of an async function that fails', async function() {
      let err;
      try {
        await utils.timer(monitor, 'pfx', async () => { throw new Error('uhoh'); });
      } catch (e) {
        err = e;
      }
      assert(err && /uhoh/.test(err.message));
      await checkMonitor(1);
    });

    test('of a promise', async function() {
      assert.equal(await utils.timer(monitor, 'pfx', takes100ms()), 13);
      await checkMonitor(1);
      assert(monitor.measures[0].ms >= 90);
    });

    test('of a failed promise', async function() {
      let err;
      try {
        await utils.timer(monitor, 'pfx', Promise.reject(new Error('uhoh')));
      } catch (e) {
        err = e;
      }
      assert(err && /uhoh/.test(err.message));
      await checkMonitor(1);
    });
  });
});
