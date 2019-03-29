const assert = require('assert');
const MonitorManager = require('../src');

suite('Registry', function() {

  test('can add custom message types', function() {
    const manager = new MonitorManager({
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
    manager.setup({
      level: 'debug',
      mock: true,
    });
    const monitor = manager.monitor();
    monitor.log.auditLog({foo: {}, bar: 'hi'});
    assert.equal(manager.messages.length, 1);
  });

  test('can verify custom types', function() {
    const manager = new MonitorManager({
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
    manager.setup({
      level: 'debug',
      mock: true,
      verify: true,
    });
    const monitor = manager.monitor();
    monitor.log.auditLog({foo: {}, bar: 'hi'});
    assert.throws(() => monitor.log.auditLog({foo: null}), /"auditLog" must include field "bar"/);
  });

  test('can publish types', function() {
    const manager = new MonitorManager({
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
    assert.deepEqual(manager.reference().types[0].type, 'monitor.timer');
    assert.deepEqual(manager.reference().types[0].name, 'basicTimer');
    assert.deepEqual(manager.reference().types[0].title, 'Basic Timer');
    assert.deepEqual(manager.reference().types[0].level, 'info');
    assert.deepEqual(manager.reference().types[0].version, 1);
    assert.deepEqual(manager.reference().types[manager.reference().types.length-1].type, 'audit');
  });
});
