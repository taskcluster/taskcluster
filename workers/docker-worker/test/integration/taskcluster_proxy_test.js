suite('taskcluster proxy', function() {
  var co = require('co');
  var request = require('superagent-promise');
  var queue = new (require('taskcluster-client').Queue);
  var cmd = require('./helper/cmd');
  var expires = require('./helper/expires')


  // We need to use the docker worker host here so the network connection code
  // actually runs...
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

  test('issue a request to taskcluster via the proxy', co(function* () {
    var expected = 'is woot';
    var payload = {
      storageType: 'reference',
      expires: expires().toJSON(),
      contentType: 'text/html',
      url: 'https://mozilla.com'
    };

    var result = yield worker.postToQueue({
      scopes: ['queue:create-artifact:custom'],
      payload: {
        image: 'centos:latest',
        features: { taskclusterProxy: true },
        artifacts: {},
        command: cmd(
          'curl --retry 5 -X POST ' +
          '-H "Content-Type: application/json" ' +
          '--data \'' + JSON.stringify(payload) + '\' ' +
          'taskcluster/queue/v1/task/$TASK_ID/runs/$RUN_ID/artifacts/custom'
        ),
        maxRunTime: 5 * 60
      }
    });

    assert.equal(result.run.state, 'completed', 'task should be successful');
    assert.equal(result.run.reasonResolved, 'completed', 'task should be successful');
    assert.ok(result.artifacts['custom'], 'custom artifact is available');
    assert.equal(result.artifacts['custom'].storageType, 'reference');
  }));
});
