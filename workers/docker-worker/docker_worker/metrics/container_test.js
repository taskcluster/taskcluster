suite('container', function() {
  this.timeout('5s');
  var uuid = require('uuid');
  var docker = require('../test/docker')();
  var DockerProc = require('dockerode-process');
  var ContainerMetrics = require('./container');

  function createProc() {
    return new DockerProc(docker, {
      create: {
        Image: 'ubuntu',
        Cmd: ['/bin/bash', '-c', 'sleep 3']
      },
      start: {}
    });
  }

  var subject;
  var id;
  setup(function() {
    id = uuid.v4();
    subject = new ContainerMetrics(id, {
      metrics: { xfoo: 1 },
      interval: 500
    });
  });

  test('#getMetrics', function(done) {
    var proc = createProc();
    proc.once('container start', function(container) {
      subject.getMetrics(container).then(
        function(metrics) {
          assert.ok(metrics.xfoo);
          var processes = metrics.processes;
          assert.ok(processes.length, 'has items in the list');
          var item = processes[0];
          assert.ok(item.rss, 'has memory stats as an object');
          done();
        },
        done
      );
    });

    proc.run().then(
      null,
      done
    );
  });

  // XXX: This is fairly bad test right now it only tests that it does not bail.
  test('#poll', function() {
    var proc = createProc();
    proc.once('container start', function(container) {
      subject.poll(container);
    });

    return proc.run().then(
      function() {
        subject.stop();
      }
    );
  });
});
