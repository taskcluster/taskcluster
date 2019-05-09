const assert = require('assert');
const MonitorManager = require('../src/monitormanager.js');
const testing = require('taskcluster-lib-testing');

suite(testing.suiteName(), function() {

  test('can add custom message types', function() {
    const manager = new MonitorManager();
    manager.register({
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
    manager.configure({
      serviceName: 'taskcluster-testing-service',
    });
    const monitor = manager.setup({
      level: 'debug',
      fake: true,
      debug: true,
    });
    monitor.log.auditLog({foo: {}, bar: 'hi'});
    assert.equal(manager.messages.length, 1);
  });

  test('can verify custom types', function() {
    const manager = new MonitorManager();
    manager.configure({
      serviceName: 'taskcluster-testing-service',
    });
    manager.register({
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
    const monitor = manager.setup({
      level: 'debug',
      fake: true,
      debug: true,
      verify: true,
    });
    monitor.log.auditLog({foo: {}, bar: 'hi'});
    assert.throws(() => monitor.log.auditLog({foo: null}), /"auditLog" must include field "bar"/);
  });

  test('can publish types', function() {
    const manager = new MonitorManager();
    manager.configure({
      serviceName: 'taskcluster-testing-service',
    });
    manager.register({
      name: 'auditLog',
      type: 'audit',
      title: 'whatever',
      level: 'info',
      version: 1,
      description: 'An example of a custom message type',
      fields: {
        foo: 'A foo field. This will be an object with ...',
        bar: 'A bar field. This will be a string',
      },
    });
    assert.equal(manager.reference().serviceName, 'taskcluster-testing-service');
    assert.deepEqual(manager.reference().types[0].type, 'audit');
    assert.deepEqual(manager.reference().types[0].name, 'auditLog');
    assert.deepEqual(manager.reference().types[0].title, 'whatever');
    assert.deepEqual(manager.reference().types[0].level, 'info');
    assert.deepEqual(manager.reference().types[0].version, 1);
  });
});
