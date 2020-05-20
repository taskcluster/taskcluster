const assert = require('assert');
const stream = require('stream');
const Ajv = require('ajv');
const MonitorManager = require('../src/monitormanager');
const testing = require('taskcluster-lib-testing');

suite(testing.suiteName(), function() {
  let monitorManager, monitor;

  setup(function() {
    monitor = MonitorManager.setup({
      serviceName: 'testing-service',
      level: 'debug',
      debug: true,
      fake: true,
      verify: true,
    });
    monitorManager = monitor.manager;
    // modify _handleMessage to log the *entire* message
    monitorManager._handleMessage =
      message => monitorManager.messages.push(message);
  });

  teardown(async function() {
    await monitor.terminate();
  });

  test('logger moves explicitly set traceId up', function() {
    monitor.info({traceId: 'foo/bar'});
    assert.equal(monitorManager.messages[0].traceId, 'foo/bar');
    assert.equal(monitorManager.messages[0].Fields.traceId, undefined);
  });

  test('logger with no traceId leaves it out', function() {
    monitor.info({something: 123});
    assert.equal(monitorManager.messages[0].traceId, undefined);
  });

  test('logger conforms to schema', function() {
    const schema = require('./mozlog_schema.json');
    monitor.info('something', {test: 123});
    const event = monitorManager.messages[0];

    const ajv = new Ajv();
    assert(ajv.validate(schema, event), ajv.errorsText());
  });

  test('logger separates lines with newlines', function() {
    let results = Buffer.alloc(0);
    const destination = new stream.Writable({
      write: (chunk, encoding, next) => {
        results = Buffer.concat([results, chunk]);
        next();
      },
    });

    const m = MonitorManager.setup({
      serviceName: 'testing-service',
      level: 'debug',
      destination,
    });

    m.info('hello', 5);
    m.warning('oh.hi', {newlined: 'foo\nbar'});
    m.warning('goodbye', 6);
    results = results.toString().split('\n');
    assert.equal(results.length, 4); // 3 log lines and one trailing newline
    JSON.parse(results[0]);
    JSON.parse(results[1]);
    JSON.parse(results[2]);
  });

  test('simple eliding', function() {
    monitor.info({credentials: 5});
    assert.equal(monitorManager.messages[0].Type, 'monitor.generic');
    assert.equal(monitorManager.messages[0].Fields.credentials, '...');
  });

  test('nested eliding', function() {
    monitor.info({whatever: [{accessToken: 'hi'}]});
    assert.equal(monitorManager.messages[0].Type, 'monitor.generic');
    assert.equal(monitorManager.messages[0].Fields.whatever[0].accessToken, '...');
  });

  test('null eliding does not crash', function() {
    monitor.info({something: null});
    assert.equal(monitorManager.messages[0].Type, 'monitor.generic');
    assert.equal(monitorManager.messages[0].Fields.something, null);
  });

  test('empty data still logs', function() {
    monitor.info({whatever: 5});
    assert.equal(monitorManager.messages[0].Type, 'monitor.generic');
    assert.equal(monitorManager.messages[0].Fields.whatever, 5);
  });

  test('string data still logs', function() {
    monitor.info('baz', 'hello');
    assert.equal(monitorManager.messages[0].Type, 'baz');
    assert.equal(monitorManager.messages[0].Fields.message, 'hello');
  });

  test('number data still logs', function() {
    monitor.info('foobar', 5.0);
    assert.equal(monitorManager.messages[0].Type, 'foobar');
    assert.equal(monitorManager.messages[0].Fields.message, 5.0);
  });

  test('multiline fields.message is truncated in message', function() {
    monitor.info('foobar', {message: 'title\nmore info\neven more'});
    assert.equal(monitorManager.messages[0].Type, 'foobar');
    assert.equal(monitorManager.messages[0].message, 'title');
    assert.equal(monitorManager.messages[0].Fields.message, 'title\nmore info\neven more');
  });

  test('null data still logs', function() {
    monitor.info('something', null);
    assert.equal(monitorManager.messages[0].Type, 'monitor.loggingError');
    assert.equal(monitorManager.messages[0].Fields.error, 'Invalid field to be logged.');
    assert.equal(monitorManager.messages[0].Fields.origType, 'something');
    assert.equal(monitorManager.messages[0].Fields.orig, null);
  });

  test('boolean data still logs', function() {
    monitor.info('something', true);
    assert.equal(monitorManager.messages[0].Type, 'monitor.loggingError');
    assert.equal(monitorManager.messages[0].Fields.error, 'Invalid field to be logged.');
    assert.equal(monitorManager.messages[0].Fields.origType, 'something');
    assert.equal(monitorManager.messages[0].Fields.orig, true);
  });

  test('metadata still logs but alerts', function() {
    monitor.info('something', {meta: 'foo'});
    assert.equal(monitorManager.messages[0].Type, 'monitor.loggingError');
    assert.equal(monitorManager.messages[0].Fields.error, 'You may not set meta fields on logs directly.');
    assert.equal(monitorManager.messages[0].Fields.origType, 'something');
    assert.equal(monitorManager.messages[0].Fields.orig.meta, 'foo');
  });

  test('all logging levels represented', function() {
    const levels = [
      'emerg',
      'alert',
      'crit',
      'err',
      'warning',
      'notice',
      'info',
      'debug',
    ];
    levels.forEach((level, i) => {
      monitor[level](`something.${level}`, {bar: i});
    });

    assert.equal(monitorManager.messages.length, 8);
    levels.forEach((level, i) => {
      assert.equal(monitorManager.messages[i].Logger, `taskcluster.testing-service`);
      assert.equal(monitorManager.messages[i].Type, `something.${level}`);
      assert.equal(monitorManager.messages[i].Fields.bar, i);
    });
  });

  test('levels work', function() {
    const m = MonitorManager.setup({
      serviceName: 'taskcluster-level',
      level: 'alert',
      fake: true,
      debug: true,
    });
    const mgr = m.manager;
    mgr._handleMessage = message => mgr.messages.push(message);
    m.info('something', {whatever: 5}); // This should not get logged
    m.alert('something.else', {whatever: 6});
    m.emerg('something.even.else', {whatever: 7});
    assert.equal(mgr.messages.length, 2);
  });
});
