import path from 'path';
import { fork } from 'child_process';
import mockFs from 'mock-fs';
import assert from 'assert';
import testing from '@taskcluster/lib-testing';
import MonitorManager from '../src/monitormanager.js';

const __dirname = new URL('.', import.meta.url).pathname;

suite(testing.suiteName(), function() {
  let monitorManager, monitor;
  let errorBucket = [];

  suiteSetup(function() {
    monitor = MonitorManager.setup({
      serviceName: 'testing-service',
      level: 'debug',
      debug: true,
      fake: {
        allowExit: true,
      },
      verify: true,
      errorConfig: {
        reporter: 'TestReporter',
        bucket: errorBucket,
      },
    });
    monitorManager = monitor.manager;
    // modify _handleMessage to log the *entire* message
    monitorManager._handleMessage =
      message => monitorManager.messages.push(message);
  });

  teardown(function() {
    errorBucket.splice(0);
    monitorManager.reset();
    mockFs.restore();
  });

  suite('timer', function() {
    const takes100ms = () => new Promise(resolve => setTimeout(() => resolve(13), 100));
    const checkMonitor = (len) => {
      // check this after a short delay, as otherwise the Promise.resolve
      // can measure something after timer returns..
      return new Promise(resolve => setTimeout(resolve, 10)).then(() => {
        assert.equal(monitorManager.messages.length, len);
        monitorManager.messages.forEach(m => {
          assert.equal(m.Logger, 'taskcluster.testing-service');
          assert.equal(m.Type, 'monitor.timer');
          assert.equal(m.Fields.key, 'pfx');
        });
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
      assert(monitorManager.messages[0].Fields.duration >= 90);
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
      assert(monitorManager.messages[0].Fields.duration >= 90);
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
      assert.equal(monitorManager.messages.length, 1);
      assert.equal(monitorManager.messages[0].Logger, 'taskcluster.testing-service');
      assert.equal(monitorManager.messages[0].Fields.name, 'expire');
      assert(monitorManager.messages[0].Fields.duration);
      assert.equal(monitorManager.messages[0].Fields.status, 'success');
      assert(!monitorManager.messages[0].Fields.error);
      assert.equal(errorBucket.length, 0);
    });

    test('unsuccessful async function', async function() {
      await monitor.oneShot('expire', async () => { throw new Error('uhoh'); });
      assert.equal(exitStatus, 1);
      assert.equal(monitorManager.messages.length, 2);
      assert.equal(monitorManager.messages[0].Type, 'monitor.error');
      assert.equal(monitorManager.messages[0].Fields.message, 'uhoh');
      assert.equal(monitorManager.messages[1].Fields.name, 'expire');
      assert(monitorManager.messages[1].Fields.duration);
      assert.equal(monitorManager.messages[1].Fields.status, 'exception');
      assert.equal(errorBucket.length, 1);
    });

    test('missing name', async function() {
      await monitor.oneShot(async () => { throw new Error('uhoh'); });
      assert.equal(exitStatus, 1);
      assert.equal(monitorManager.messages.length, 2);
      assert.equal(monitorManager.messages[0].Type, 'monitor.error');
      assert.equal(monitorManager.messages[0].Fields.code, 'ERR_ASSERTION');
      assert.equal(errorBucket.length, 2); // One for normal error and one for missing name
    });
  });

  suite('child monitors', function() {
    test('..make sense', function() {
      const child = monitor.childMonitor('api');
      monitor.count('foobar', 5);
      child.count('foobar', 6);

      assert.equal(monitorManager.messages.length, 2);
      assert.equal(monitorManager.messages[0].Logger, 'taskcluster.testing-service');
      assert.equal(monitorManager.messages[1].Logger, 'taskcluster.testing-service.api');
      assert.equal(monitorManager.messages[0].Fields.val, 5);
      assert.equal(monitorManager.messages[1].Fields.val, 6);
    });

    test('can double prefix', function() {
      const child = monitor.childMonitor('api');
      const grandchild = monitor.childMonitor('api.something');
      monitor.count('foobar', 5);
      child.count('foobar', 6);
      grandchild.count('foobar', 7);

      assert.equal(monitorManager.messages.length, 3);
      assert.equal(monitorManager.messages[0].Logger, 'taskcluster.testing-service');
      assert.equal(monitorManager.messages[1].Logger, 'taskcluster.testing-service.api');
      assert.equal(monitorManager.messages[2].Logger, 'taskcluster.testing-service.api.something');
      assert.equal(monitorManager.messages[0].Fields.val, 5);
      assert.equal(monitorManager.messages[1].Fields.val, 6);
      assert.equal(monitorManager.messages[2].Fields.val, 7);
    });

    test('traceId becomes top-level', function() {
      const child = monitor.taskclusterPerRequestInstance({ entryName: 'what', traceId: 'foo/bar', requestId: '123/456' });
      monitor.measure('bazbing', 5);
      child.measure('bazbing', 6);

      assert.equal(monitorManager.messages.length, 2);
      assert.equal(monitorManager.messages[0].Logger, 'taskcluster.testing-service');
      assert.equal(monitorManager.messages[1].Logger, 'taskcluster.testing-service');
      assert.equal(monitorManager.messages[0].Fields.meta, undefined);
      assert.equal(monitorManager.messages[1].Fields.meta, undefined);
      assert.equal(monitorManager.messages[0].traceId, undefined);
      assert.equal(monitorManager.messages[1].traceId, 'foo/bar');
      assert.equal(monitorManager.messages[0].requestId, undefined);
      assert.equal(monitorManager.messages[1].requestId, '123/456');
    });

    test('metadata is merged', function() {
      const child = monitor.childMonitor('api', { addition: 1000 });
      monitor.measure('bazbing', 5);
      child.measure('bazbing', 6);

      assert.equal(monitorManager.messages.length, 2);
      assert.equal(monitorManager.messages[0].Logger, 'taskcluster.testing-service');
      assert.equal(monitorManager.messages[1].Logger, 'taskcluster.testing-service.api');
      assert.equal(monitorManager.messages[0].Fields.addition, undefined);
      assert.equal(monitorManager.messages[1].Fields.addition, 1000);
    });

    test('can configure child loggers with specific levels and default to root', function() {
      const m = MonitorManager.setup({
        serviceName: 'testing-service',
        level: 'root:info api:debug',
        fake: true,
        debug: true,
      });

      const child1 = m.childMonitor('api');
      const child2 = m.childMonitor('handler');
      m.debug('foobar', 1);
      child1.debug('bazbing', 2);
      child2.debug('what', 3);

      assert.equal(m.manager.messages.length, 1);
      assert.equal(m.manager.messages[0].Logger, 'taskcluster.testing-service.api');
    });

    test('if using child logger levels, must specify root', function() {
      assert.throws(() => MonitorManager.setup({
        serviceName: 'testing-service',
        level: 'root.api:debug',
        fake: true,
        debug: true,
      }));
    });
  });

  suite('uncaught and unhandled', function() {
    const testExits = (done, args, check) => {
      let output = '';

      const proc = fork(
        path.resolve(__dirname, './exit.js'),
        args,
        {
          silent: true,
        },
      );
      proc.stdout.on('data', data => output += data.toString());
      proc.stderr.on('data', data => output += data.toString());

      proc.on('exit', code => {
        check(done, code, output);
      });
    };

    test('normal', function(done) {
      testExits(done, [], (done, code, output) => {
        assert.equal(code, 0);
        assert.equal(output, '');
        done();
      });
    });

    test('thrown but with no interception', function(done) {
      testExits(done, [
        '--shouldError',
      ], (done, code, output) => {
        assert.equal(code, 1);
        assert(output.includes('Error: hello there'));
        assert.throws(() => JSON.parse(output));
        done();
      });
    });

    test('thrown with interception', function(done) {
      testExits(done, [
        '--shouldError',
        '--patchGlobal',
      ], (done, code, output) => {
        assert.equal(code, 1);
        assert(output.includes('Error: hello there'));
        assert(JSON.parse(output.split('\n')[0]));
        assert.equal(output.split('\n')[1], 'REPORTED ERROR');
        done();
      });
    });

    test('unhandled but with no interception', function(done) {
      testExits(done, [
        '--shouldUnhandle',
      ], (done, code, output) => {
        assert.equal(code, 1);
        assert(output.includes("Promise.reject(new Error('whaaa'));"));
        assert.throws(() => JSON.parse(output));
        done();
      });
    });

    test('unhandled with interception', function(done) {
      testExits(done, [
        '--shouldUnhandle',
        '--patchGlobal',
        '--bailOnUnhandledRejection',
      ], (done, code, output) => {
        assert.equal(code, 1);
        assert(output.includes('whaaa'));
        assert(JSON.parse(output.split('\n')[0]));
        assert.equal(output.split('\n')[1], 'REPORTED ERROR');
        done();
      });
    });

    test('unhandled with interception but continues', function(done) {
      testExits(done, [
        '--shouldUnhandle',
        '--patchGlobal',
      ], (done, code, output) => {
        assert.equal(code, 0);
        assert(output.includes('whaaa'));
        assert(JSON.parse(output));
        done();
      });
    });

  });

  suite('other basics', function() {
    test('should record errors', function() {
      monitor.reportError(new Error('oh no'));
      assert.equal(monitorManager.messages.length, 1);
      assert.equal(monitorManager.messages[0].Severity, 3);
      assert.equal(monitorManager.messages[0].severity, 'ERROR');
      assert.equal(monitorManager.messages[0].Fields.name, 'Error');
      assert.equal(monitorManager.messages[0].Fields.message, 'oh no');
      assert.equal(monitorManager.messages[0].message, monitorManager.messages[0].Fields.stack);
    });

    test('should record first line of multiline errors', function() {
      monitor.reportError(new Error('uhoh\nsomething went wrong\n..again'));
      assert.equal(monitorManager.messages.length, 1);
      // the toplevel message has the first line of the error plus stack
      // (this format is required by stackdriver)
      assert(monitorManager.messages[0].message
        .startsWith('Error: uhoh\n    at '));
      // Fields.stack has the full multiline stack
      assert(monitorManager.messages[0].Fields.stack
        .startsWith('Error: uhoh\nsomething went wrong\n..again\n    at '));
      // and fields.message has the full message but no stack
      assert.equal(monitorManager.messages[0].Fields.message,
        'uhoh\nsomething went wrong\n..again');
    });

    test('should record top-level string or numeric fields of errors, but no more', function() {
      const err = new Error('uhoh');
      err.color = "prussian blue";
      err.temperature = 290.8; // Kelvin, obviously
      err.count = 13;
      err.object = { x: 10 };
      err.array = [1, 2];
      monitor.reportError(err);
      assert.equal(monitorManager.messages.length, 1);
      assert(monitorManager.messages[0].message.startsWith("Error: uhoh\n"));
      assert.equal(monitorManager.messages[0].Fields.color, "prussian blue");
      assert.equal(monitorManager.messages[0].Fields.temperature, 290.8);
      assert.equal(monitorManager.messages[0].Fields.count, 13);
      assert.equal(monitorManager.messages[0].Fields.object, undefined); // omitted
      assert.equal(monitorManager.messages[0].Fields.array, undefined); // omitted
    });

    test('should record errors with extra', function() {
      monitor.reportError(new Error('oh no'), { foo: 5 });
      assert.equal(monitorManager.messages.length, 1);
      assert.equal(monitorManager.messages[0].Severity, 3);
      assert.equal(monitorManager.messages[0].severity, 'ERROR');
      assert.equal(monitorManager.messages[0].Fields.name, 'Error');
      assert.equal(monitorManager.messages[0].Fields.message, 'oh no');
      assert.equal(monitorManager.messages[0].Fields.foo, 5);
      assert(monitorManager.messages[0].Fields.stack);
    });

    test('should record errors with extra and level', function() {
      monitor.reportError(new Error('oh no'), 'warning', { foo: 5 });
      assert.equal(monitorManager.messages.length, 1);
      assert.equal(monitorManager.messages[0].Severity, 4);
      assert.equal(monitorManager.messages[0].severity, 'WARNING');
      assert.equal(monitorManager.messages[0].Fields.name, 'Error');
      assert.equal(monitorManager.messages[0].Fields.message, 'oh no');
      assert.equal(monitorManager.messages[0].Fields.foo, 5);
      assert(monitorManager.messages[0].Fields.stack);
    });

    test('should record errors that are strings', function() {
      monitor.reportError('oh no');
      assert.equal(monitorManager.messages.length, 1);
      assert.equal(monitorManager.messages[0].Fields.name, 'Error');
      assert.equal(monitorManager.messages[0].Fields.message, 'oh no');
      assert(monitorManager.messages[0].Fields.stack);
    });

    test('should count', function() {
      monitor.count('something', 5);
      assert.equal(monitorManager.messages.length, 1);
      assert.equal(monitorManager.messages[0].Fields.key, 'something');
      assert.equal(monitorManager.messages[0].Fields.val, 5);
      assert.equal(monitorManager.messages[0].Severity, 6);
    });

    test('should count with default', function() {
      monitor.count('something');
      assert.equal(monitorManager.messages.length, 1);
      assert.equal(monitorManager.messages[0].Fields.key, 'something');
      assert.equal(monitorManager.messages[0].Fields.val, 1);
      assert.equal(monitorManager.messages[0].Severity, 6);
    });

    test('should measure', function() {
      monitor.measure('whatever', 50);
      assert.equal(monitorManager.messages.length, 1);
      assert.equal(monitorManager.messages[0].Fields.key, 'whatever');
      assert.equal(monitorManager.messages[0].Fields.val, 50);
      assert.equal(monitorManager.messages[0].Severity, 6);
    });

    test('should reject malformed counts', function() {
      monitor.count('something', 'foo');
      assert.equal(monitorManager.messages.length, 1);
      assert.equal(monitorManager.messages[0].Severity, 3);
      assert.equal(monitorManager.messages[0].Fields.name, 'AssertionError');
    });

    test('should reject malformed measures', function() {
      monitor.measure('something', 'bar');
      assert.equal(monitorManager.messages.length, 1);
      assert.equal(monitorManager.messages[0].Severity, 3);
      assert.equal(monitorManager.messages[0].Fields.name, 'AssertionError');
    });

    test('should monitor resource usage', async function() {
      monitor._resources('testy', 0.1);
      await testing.poll(async () => {
        assert(monitorManager.messages.some(message => message.Fields.lastCpuUsage !== undefined));
      });
      clearInterval(monitor._resourceInterval);
    });

    test('monitor.timeKeeper', async () => {
      const doodad = monitor.timeKeeper('doodadgood');
      doodad.measure();
      assert.equal(monitorManager.messages.length, 1);
      assert.equal(monitorManager.messages[0].Fields.key, 'doodadgood');
    });

    test('monitor.timeKeeper forced double submit', async () => {
      const doodad = monitor.timeKeeper('doodadgood');
      doodad.measure();
      doodad.measure(true);
      assert.equal(monitorManager.messages.length, 2);
      assert.equal(monitorManager.messages[0].Fields.key, 'doodadgood');
      assert.equal(monitorManager.messages[1].Fields.key, 'doodadgood');
    });

    test('monitor.timeKeeper unforced double submit throws', async () => {
      const doodad = monitor.timeKeeper('doodadgood');
      doodad.measure();
      assert.throws(() => doodad.measure(), Error);
    });
  });

  test('dockerflow version file', async () => {
    mockFs({
      '../../version.json': JSON.stringify({ version: 'whatever' }),
    });
    const monitor = MonitorManager.setup({
      serviceName: 'testing-service',
      level: 'debug',
      debug: true,
      fake: {
        allowExit: true,
      },
      verify: true,
      errorConfig: {
        reporter: 'TestReporter',
        bucket: errorBucket,
      },
    });
    assert.equal(monitor.manager.taskclusterVersion, 'whatever');
  });
});
