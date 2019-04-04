const assert = require('assert');
const stream = require('stream');
const Ajv = require('ajv');
const MonitorManager = require('../src');
const testing = require('taskcluster-lib-testing');

suite(testing.suiteName(), function() {
  let manager, monitor, messages, destination;

  setup(function() {
    manager = new MonitorManager({
      serviceName: 'testing-service',
    });
    // similar to the mock destination, but capturing all fields
    destination = new stream.Writable({
      write: (chunk, encoding, next) => {
        try {
          messages.push(JSON.parse(chunk));
        } catch (err) {
          if (err.name !== 'SyntaxError') {
            throw err;
          }
        }
        next();
      },
    });
    messages = [];
    manager.setup({
      level: 'debug',
      destination,
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
    const event = messages[0];

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

  test('simple eliding', function() {
    monitor.info({credentials: 5});
    assert.equal(messages[0].Type, 'monitor.generic');
    assert.equal(messages[0].Fields.credentials, '...');
  });

  test('nested eliding', function() {
    monitor.info({whatever: [{accessToken: 'hi'}]});
    assert.equal(messages[0].Type, 'monitor.generic');
    assert.equal(messages[0].Fields.whatever[0].accessToken, '...');
  });

  test('null eliding does not crash', function() {
    monitor.info({something: null});
    assert.equal(messages[0].Type, 'monitor.generic');
    assert.equal(messages[0].Fields.something, null);
  });

  test('empty data still logs', function() {
    monitor.info({whatever: 5});
    assert.equal(messages[0].Type, 'monitor.generic');
    assert.equal(messages[0].Fields.whatever, 5);
  });

  test('string data still logs', function() {
    monitor.info('baz', 'hello');
    assert.equal(messages[0].Type, 'baz');
    assert.equal(messages[0].Fields.message, 'hello');
  });

  test('number data still logs', function() {
    monitor.info('foobar', 5.0);
    assert.equal(messages[0].Type, 'foobar');
    assert.equal(messages[0].Fields.message, 5.0);
  });

  test('null data still logs', function() {
    monitor.info('something', null);
    assert.equal(messages[0].Type, 'monitor.loggingError');
    assert.equal(messages[0].Fields.error, 'Invalid field to be logged.');
    assert.equal(messages[0].Fields.origType, 'something');
    assert.equal(messages[0].Fields.orig, null);
  });

  test('boolean data still logs', function() {
    monitor.info('something', true);
    assert.equal(messages[0].Type, 'monitor.loggingError');
    assert.equal(messages[0].Fields.error, 'Invalid field to be logged.');
    assert.equal(messages[0].Fields.origType, 'something');
    assert.equal(messages[0].Fields.orig, true);
  });

  test('metadata still logs but alerts', function() {
    monitor.info('something', {meta: 'foo'});
    assert.equal(messages[0].Type, 'monitor.loggingError');
    assert.equal(messages[0].Fields.error, 'You may not set meta fields on logs directly.');
    assert.equal(messages[0].Fields.origType, 'something');
    assert.equal(messages[0].Fields.orig.meta, 'foo');
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

    assert.equal(messages.length, 8);
    levels.forEach((level, i) => {
      assert.equal(messages[i].Logger, `taskcluster.testing-service.root`);
      assert.equal(messages[i].Type, `something.${level}`);
      assert.equal(messages[i].Fields.bar, i);
    });
  });

  test('levels work', function() {
    const b = new MonitorManager({
      serviceName: 'taskcluster-level',
    });
    b.setup({
      level: 'alert',
      destination,
      mock: true,
    });
    const m = b.monitor();
    m.info('something', {whatever: 5}); // This should not get logged
    m.alert('something.else', {whatever: 6});
    m.emerg('something.even.else', {whatever: 7});
    assert.equal(messages.length, 2);
  });

  const prettyDestination = new stream.Writable({
    write: (chunk, encoding, next) => {
      messages.push(chunk.toString());
      next();
    },
  });
  test('pretty', function() {
    const b = new MonitorManager({
      serviceName: 'taskcluster-level',
    });
    b.setup({
      level: 'debug',
      destination: prettyDestination,
      mock: true,
      pretty: true,
    });
    const m = b.monitor();
    m.info('something', {whatever: 5});
    assert.equal(messages.length, 1);
    const message = messages[0].toString();
    assert(message.includes('INFO'));
    assert(message.includes('whatever: 5'));
  });

  test('pretty with newline', function() {
    const b = new MonitorManager({
      serviceName: 'taskcluster-level',
    });
    b.setup({
      level: 'debug',
      destination: prettyDestination,
      mock: true,
      pretty: true,
    });
    const m = b.monitor();
    m.err('something', {whatever: 'foo\nbar'});
    assert.equal(messages.length, 1);
    const message = messages[0].toString();
    assert(message.includes('ERROR'));
    assert(message.includes('whatever: foo\\nbar'));
  });
});
