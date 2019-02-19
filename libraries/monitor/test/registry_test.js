const assert = require('assert');
const MonitorManager = require('../src');

suite('Registry', function() {

  test('can add custom message types', function() {
    manager = new MonitorManager({
      serviceName: 'taskcluster-testing-service',
    });
    manager.register({
      name: 'auditLog',
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
    monitor = manager.monitor();
    monitor.log.auditLog({foo: {}, bar: 'hi'});
    assert.equal(manager.messages.length, 1);
  });

  test('can publish types', function() {
    manager = new MonitorManager({
      serviceName: 'taskcluster-testing-service',
    });
    manager.register({
      name: 'auditLog',
      type: 'audit',
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
    assert.deepEqual(manager.reference().types[0].version, 1);
    assert.deepEqual(manager.reference().types[manager.reference().types.length-1].type, 'audit');
  });
});
