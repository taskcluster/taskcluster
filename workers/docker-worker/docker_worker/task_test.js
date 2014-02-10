suite('task', function() {
  var Task = require('./task');
  var TaskFactory = require('taskcluster-task-factory/task');

  var task = TaskFactory.create({
    // give us a compelling exit code
    command: ['echo', '123'],

    parameters: {
      docker: {
        // use generic ubuntu image
        image: 'ubuntu'
      }
    }
  });

  var subject;
  setup(function() {
    subject = new Task(task);
  });

  suite('#feature', function() {
    test('with no feature field', function() {
      assert.equal(subject.feature('diesInstantly', false), false);
    });

    test('with feature field', function() {
      subject = new Task({
        features: {
          xfoo: 'xfoo'
        }
      });
      assert.equal(subject.feature('xfoo'), 'xfoo');
    });
  });

  test('#createContainerConfig', function() {
    assert.deepEqual(
      subject.createContainerConfig(),
      {
        Hostname: '',
        User: '',
        AttachStdin: false,
        AttachStdout: true,
        AttachStderr: true,
        Tty: true,
        OpenStdin: false,
        StdinOnce: false,
        Cmd: ['echo', '123'],
        Image: 'ubuntu'
      }
    );
  });

  test('#startContainerConfig', function() {
    assert.deepEqual(
      subject.startContainerConfig(),
      {}
    );
  });
});
