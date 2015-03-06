suite('live logging', function() {
  var co = require('co');
  var cmd = require('./helper/cmd');

  // Need to use the docker worker to ensure test works on OSX hots...
  var DockerWorker = require('../dockerworker');
  var TestWorker = require('../testworker');

  var worker;
  setup(co(function * () {
    worker = new TestWorker(DockerWorker);
    yield worker.launch();
  }));

  teardown(co(function* () {
    yield worker.terminate();
  }));

  test('live logging of content', co(function* () {
    var result = yield worker.postToQueue({
      payload: {
        image: 'taskcluster/test-ubuntu',
        command: [
          '/bin/bash',
          '-c',
          'echo "first command!"; ' +
          'for i in {1..1000}; do echo "Hello Number $i"; done;'
        ],
        maxRunTime: 5 * 60
      }
    });

    // Expected junk in the log.
    var log = '';
    for (var i = 1; i <= 1000; i++) {
      log += 'Hello Number ' + i + '\r\n';
    }

    assert.equal(result.run.state, 'completed', 'task should be successfull');
    assert.equal(result.run.reasonResolved, 'completed', 'task should be successfull');
    assert.ok(result.log.indexOf(log) !== -1, 'contains each expected line');
  }));
});
