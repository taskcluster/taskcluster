const assert = require('assert');
const MonitorBuilder = require('../src');

suite('Registry', function() {

  test('can add custom message types', function() {
    builder = new MonitorBuilder({
      projectName: 'taskcluster-testing-service',
    });
    builder.register({
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
    builder.setup({
      level: 'debug',
      mock: true,
    });
    monitor = builder.monitor();
    monitor.log.auditLog({foo: {}, bar: 'hi'});
    assert.equal(builder.messages.length, 1);
  });

  test('can publish types', function() {
    builder = new MonitorBuilder({
      projectName: 'taskcluster-testing-service',
    });
    builder.register({
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
    assert.equal(builder.reference().projectName, 'taskcluster-testing-service');
    assert.deepEqual(builder.reference().types[0].type, 'monitor.timer');
    assert.deepEqual(builder.reference().types[0].version, 1);
    assert.deepEqual(builder.reference().types[builder.reference().types.length-1].type, 'audit');
  });
});
