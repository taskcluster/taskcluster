const assert = require('assert');
const stream = require('stream');
const Ajv = require('ajv');
const Monitor = require('../src');

suite('Logging', function() {
  let monitor;
  let logger;

  setup(function() {
    monitor = new Monitor({
      projectName: 'taskcluster-testing-service',
      level: 'debug',
      mock: true,
    });
    logger = monitor.logger();
  });

  teardown(function() {
    monitor.terminate();
  });

  test('logger conforms to schema', function() {
    const schema = require('./mozlog_schema.json');
    monitor.info('something', {test: 123});
    const event = monitor.events[0];

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
    const m = new Monitor({
      projectName: 'taskcluster-testing-service',
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

  test('empty data still logs', function() {
    monitor.info({whatever: 5});
    assert.equal(monitor.events[0].Type, 'generic');
    assert.equal(monitor.events[0].Fields.whatever, 5);
  });

  test('string data still logs', function() {
    monitor.info('baz', 'hello');
    assert.equal(monitor.events[0].Type, 'baz');
    assert.equal(monitor.events[0].Fields.msg, 'hello');
  });

  test('number data still logs', function() {
    monitor.info('foobar', 5.0);
    assert.equal(monitor.events[0].Type, 'foobar');
    assert.equal(monitor.events[0].Fields.val, 5.0);
  });

  test('null data still logs', function() {
    monitor.info('something', null);
    assert.equal(monitor.events[0].Type, 'something');
    assert.equal(monitor.events[0].Fields.error, 'Invalid field to be logged.');
    assert.equal(monitor.events[0].Fields.orig, null);
  });

  test('boolean data still logs', function() {
    monitor.info('something', true);
    assert.equal(monitor.events[0].Type, 'something');
    assert.equal(monitor.events[0].Fields.error, 'Invalid field to be logged.');
    assert.equal(monitor.events[0].Fields.orig, true);
  });

  test('metadata still logs but alerts', function() {
    monitor.info('something', true);
    assert.equal(monitor.events[0].Type, 'something');
    assert.equal(monitor.events[0].Fields.error, 'Invalid field to be logged.');
    assert.equal(monitor.events[0].Fields.orig, true);
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

    assert.equal(monitor.events.length, 8);
    levels.forEach((level, i) => {
      assert.equal(monitor.events[i].Logger, `taskcluster-testing-service.root`);
      assert.equal(monitor.events[i].Type, `something.${level}`);
      assert.equal(monitor.events[i].Fields.bar, i);
    });
  });

  test('levels work', function() {
    const m = new Monitor({
      projectName: 'taskcluster-level',
      level: 'alert',
      mock: true,
    });
    m.info('something', {whatever: 5}); // This should not get logged
    m.alert('something.else', {whatever: 6});
    m.emerg('something.even.else', {whatever: 7});
    assert.equal(m.events.length, 2);
  });

  test('pretty', function() {
    const m = new Monitor({
      projectName: 'taskcluster-level',
      level: 'debug',
      mock: true,
      pretty: true,
    });
    m.info('something', {whatever: 5});
    assert.equal(m.events.length, 1);
    const event = m.events[0].toString();
    assert(event.includes('INFO'));
    assert(event.includes('whatever: 5'));
  });

  test('pretty with newline', function() {
    const m = new Monitor({
      projectName: 'taskcluster-level',
      level: 'debug',
      mock: true,
      pretty: true,
    });
    m.err('something', {whatever: 'foo\nbar'});
    assert.equal(m.events.length, 1);
    const event = m.events[0].toString();
    assert(event.includes('ERROR'));
    assert(event.includes('whatever: foo\\nbar'));
  });

  test('disabling works', function() {
    const m = new Monitor({
      projectName: 'taskcluster-level',
      level: 'debug',
      mock: true,
      enable: false,
    });
    m.info('something', {whatever: 5}); // This should not get logged
    assert.equal(m.events.length, 0);
  });

});
