suite('host', function() {
  this.timeout('10s');
  var uuid = require('uuid');
  var Host = require('./host');

  var subject;
  var id;
  setup(function() {
    id = uuid.v4();
    subject = new Host(id, {
      metrics: { xfoo: 1 }
    });
  });

  test('#getMetrics', function() {
    var metrics = subject.getMetrics();
    assert.ok(metrics.xfoo, 'passes values down from constructor');
    assert.ok(metrics.memory, 'passes memory values down');
  });
});
