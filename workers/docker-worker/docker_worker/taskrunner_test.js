suite('run_task', function() {
  var Promise = require('promise'),
      TaskFactory = require('taskcluster-task-factory/task'),
      Docker = require('./test/docker'),
      TaskRunner = require('./taskrunner'),
      PassThrough = require('stream').PassThrough;

  function passResult() {
    var stream = new PassThrough();
    stream.text = '';

    stream.on('data', function(value) {
      stream.text += value.toString();
    });

    return stream;
  }

  var docker;
  setup(function() {
    docker = new Docker();
  });

  var repo = 'lightsofapollo/test-taskenv';
  var purgeImage = require('./test/purge_image');

  setup(function(done) {
    return purgeImage(docker, repo);
  });

  teardown(function(done) {
    return purgeImage(docker, repo);
  });

  suite('#execute - no image download', function() {
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
      subject = new TaskRunner(docker, task);
    });

    teardown(function() {
      return subject.destroy();
    });

    test('within ubuntu container', function(done) {
      assert.equal(subject.state, TaskRunner.STATES.off);
      var stream = passResult();

      var promise = subject.execute(stream).then(
        function(result) {
          assert.equal(stream.text.trim().slice(-3), '123');
          assert.ok(subject.container);
          assert.equal(subject.state, TaskRunner.STATES.done);
        }
      );

      assert.equal(subject.state, TaskRunner.STATES.running);

      return promise;
    });
  });

  suite('#execute - lightsofapollo/test-taskenv:fail', function() {
    var task = TaskFactory.create({
      // give us a compelling exit code
      command: ['taskhost-who'],

      parameters: {
        docker: {
          image: 'lightsofapollo/test-taskenv:fail'
        }
      }
    });

    var subject;
    setup(function() {
      subject = new TaskRunner(docker, task);
    });

    test('taskrunner-who result', function(done) {
      var stream = passResult();
      return subject.execute(stream).then(
        function(result) {
          assert.ok(stream.text.indexOf('exit 66') !== -1);
        }
      );
    });
  });

  suite('#execute - lightsofapollo/test-taskenv:pass', function() {
    var token = '__UNIQ__';
    var task = TaskFactory.create({
      // give us a compelling exit code
      command: ['taskhost-who', token],

      parameters: {
        docker: {
          image: 'lightsofapollo/test-taskenv:pass'
        }
      }
    });

    var subject;
    setup(function() {
      subject = new TaskRunner(docker, task);
    });

    test('taskrunner-who result', function(done) {
      var gotUniq;
      var stream = passResult();

      return subject.execute(stream).then(
        function(result) {
           //ensure we are getting stdout
          assert.equal(result.statusCode, 0);
          assert.ok(stream.text.indexOf('__UNIQ__') !== -1);
        }
      );
    });
  });

  suite('#destroy', function() {
    var task = TaskFactory.create({
      // give us a compelling exit code
      command: ['/bin/bash', '-c', 'echo woot'],

      parameters: {
        docker: {
          // use generic ubuntu image
          image: 'ubuntu'
        }
      }
    });

    var subject;
    setup(function(done) {
      subject = new TaskRunner(docker, task);
      return subject.execute(process.stdout);
    });

    var containerId;
    setup(function() {
      containerId = subject.container.id;
      return subject.destroy();
    });

    test('removes container', function(done) {
      assert.equal(subject.state, TaskRunner.STATES.destroyed);
      assert.ok(!subject.container, 'container is removed');

      return docker.listContainers().then(
        function(containers) {
          var hasAny = containers.some(function(container) {
            return container.Id === containerId;
          });

          assert.ok(!hasAny, 'removes container from docker');
        }
      );
    });
  });
});
