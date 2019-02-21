const assert = require('assert');
const stream = require('stream');
const Ajv = require('ajv');
const MonitorManager = require('../src');

suite('Logging', function() {
  let manager;
  let monitor;

  setup(function() {
    manager = new MonitorManager({
      serviceName: 'testing-service',
    });
    manager.setup({
      level: 'debug',
      mock: true,
      verify: true,
    });
    monitor = manager.monitor();
  });

  teardown(function() {
    manager.terminate();
  });

  test('logger conforms to schema', function() {
    const schema = require('./mozlog_schema.json');
    monitor.info('something', {test: 123});
    const event = manager.messages[0];

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

    const b = new MonitorManager({
      serviceName: 'testing-service',
    });
    b.setup({
      level: 'debug',
      destination,
    });
    const m = b.monitor();

    m.info('hello', 5);
    m.warning('oh.hi', {newlined: 'foo\nbar'});
    m.warning('goodbye', 6);
    results = results.toString().split('\n');
    assert.equal(results.length, 4); // 3 log lines and one trailing newline
    JSON.parse(results[0]);
    JSON.parse(results[1]);
    JSON.parse(results[2]);
  });

  test('empty data still logs', function() {
    monitor.info({whatever: 5});
    assert.equal(manager.messages[0].Type, 'monitor.generic');
    assert.equal(manager.messages[0].Fields.whatever, 5);
  });

  test('string data still logs', function() {
    monitor.info('baz', 'hello');
    assert.equal(manager.messages[0].Type, 'baz');
    assert.equal(manager.messages[0].Fields.message, 'hello');
  });

  test('number data still logs', function() {
    monitor.info('foobar', 5.0);
    assert.equal(manager.messages[0].Type, 'foobar');
    assert.equal(manager.messages[0].Fields.message, 5.0);
  });

  test('null data still logs', function() {
    monitor.info('something', null);
    assert.equal(manager.messages[0].Type, 'monitor.loggingError');
    assert.equal(manager.messages[0].Fields.error, 'Invalid field to be logged.');
    assert.equal(manager.messages[0].Fields.origType, 'something');
    assert.equal(manager.messages[0].Fields.orig, null);
  });

  test('boolean data still logs', function() {
    monitor.info('something', true);
    assert.equal(manager.messages[0].Type, 'monitor.loggingError');
    assert.equal(manager.messages[0].Fields.error, 'Invalid field to be logged.');
    assert.equal(manager.messages[0].Fields.origType, 'something');
    assert.equal(manager.messages[0].Fields.orig, true);
  });

  test('metadata still logs but alerts', function() {
    monitor.info('something', {meta: 'foo'});
    assert.equal(manager.messages[0].Type, 'monitor.loggingError');
    assert.equal(manager.messages[0].Fields.error, 'You may not set meta fields on logs directly.');
    assert.equal(manager.messages[0].Fields.origType, 'something');
    assert.equal(manager.messages[0].Fields.orig.meta, 'foo');
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

    assert.equal(manager.messages.length, 8);
    levels.forEach((level, i) => {
      assert.equal(manager.messages[i].Logger, `taskcluster.testing-service.root`);
      assert.equal(manager.messages[i].Type, `something.${level}`);
      assert.equal(manager.messages[i].Fields.bar, i);
    });
  });

  test('levels work', function() {
    const b = new MonitorManager({
      serviceName: 'taskcluster-level',
    });
    b.setup({
      level: 'alert',
      mock: true,
    });
    const m = b.monitor();
    m.info('something', {whatever: 5}); // This should not get logged
    m.alert('something.else', {whatever: 6});
    m.emerg('something.even.else', {whatever: 7});
    assert.equal(b.messages.length, 2);
  });

  test('pretty', function() {
    const b = new MonitorManager({
      serviceName: 'taskcluster-level',
    });
    b.setup({
      level: 'debug',
      mock: true,
      pretty: true,
    });
    const m = b.monitor();
    m.info('something', {whatever: 5});
    assert.equal(b.messages.length, 1);
    const message = b.messages[0].toString();
    assert(message.includes('INFO'));
    assert(message.includes('whatever: 5'));
  });

  test('pretty with newline', function() {
    const b = new MonitorManager({
      serviceName: 'taskcluster-level',
    });
    b.setup({
      level: 'debug',
      mock: true,
      pretty: true,
    });
    const m = b.monitor();
    m.err('something', {whatever: 'foo\nbar'});
    assert.equal(b.messages.length, 1);
    const message = b.messages[0].toString();
    assert(message.includes('ERROR'));
    assert(message.includes('whatever: foo\\nbar'));
  });

  test('disabling works', function() {
    const b = new MonitorManager({
      serviceName: 'taskcluster-level',
    });
    b.setup({
      level: 'debug',
      mock: true,
      enable: false,
    });
    const m = b.monitor();
    m.info('something', {whatever: 5}); // This should not get logged
    assert.equal(b.messages.length, 0);
  });
});
