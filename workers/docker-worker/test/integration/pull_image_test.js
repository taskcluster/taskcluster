suite('pull image', function() {
  var co = require('co');
  var request = require('superagent-promise');
  var testworker = require('../post_task');
  var docker = require('../../lib/docker')();
  var dockerUtils = require('dockerode-process/utils');
  var cmd = require('./helper/cmd');

  var IMAGE = 'taskcluster/test-ubuntu';
  test('ensure image can be pulled', co(function* () {
    yield dockerUtils.removeImageIfExists(docker, IMAGE);
    var result = yield testworker({
      payload: {
        image: IMAGE,
        command: cmd('ls'),
        maxRunTime: 5 * 60
      }
    });
    assert.equal(result.run.state, 'completed', 'task should be successfull');
    assert.equal(result.run.reasonResolved, 'completed', 'task should be successfull');
  }));
});

