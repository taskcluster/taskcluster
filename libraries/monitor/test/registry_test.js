const assert = require('assert');
const {find} = require('lodash');
const MonitorManager = require('../src/monitormanager.js');
const testing = require('taskcluster-lib-testing');

MonitorManager.register({
  name: 'auditLog',
  title: 'whatever',
  type: 'audit',
  level: 'info',
  version: 1,
  description: 'An example of a custom message type',
  fields: {
    foo: 'A foo field. This will be an object with ...',
    bar: 'A bar field. This will be a string',
  },
});

suite(testing.suiteName(), function() {
  test('can add custom message types', function() {
    const monitor = MonitorManager.setup({
      serviceName: 'taskcluster-testing-service',
      level: 'debug',
      fake: true,
      debug: true,
    });
    monitor.log.auditLog({foo: {}, bar: 'hi'});
    assert.equal(monitor.manager.messages.length, 1);
  });

  test('can verify custom types', function() {
    const monitor = MonitorManager.setup({
      serviceName: 'taskcluster-testing-service',
      level: 'debug',
      fake: true,
      debug: true,
      verify: true,
    });
    monitor.log.auditLog({foo: {}, bar: 'hi'});
    assert.throws(() => monitor.log.auditLog({foo: null}), /"auditLog" must include field "bar"/);
  });

  test('can publish types', function() {
    const serviceName = 'taskcluster-testing-service';
    assert.equal(MonitorManager.reference(serviceName).serviceName, serviceName);
    const ref = find(MonitorManager.reference(serviceName).types, {name: 'auditLog'});
    assert.deepEqual(ref.type, 'audit');
    assert.deepEqual(ref.name, 'auditLog');
    assert.deepEqual(ref.title, 'whatever');
    assert.deepEqual(ref.level, 'info');
    assert.deepEqual(ref.version, 1);
  });
});
