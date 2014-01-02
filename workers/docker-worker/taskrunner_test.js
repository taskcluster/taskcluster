suite('run_task', function() {
  var Promise = require('promise'),
      TaskFactory = require('taskcluster-task-factory'),
      Docker = require('dockerode-promise'),
      TaskRunner = require('./taskrunner'),
      PassStream = require('stream').PassThrough;

  var docker;
  setup(function() {
    docker = new Docker({
      host: 'http://localhost', port: 60034
    });
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
      command: ['exit', '222'],

      machine: {
        // use generic ubuntu image
        image: 'ubuntu'
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

      var promise = subject.execute(process.stdout).then(
        function(result) {
          assert.equal(result.statusCode, 222);
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

      machine: {
        image: 'lightsofapollo/test-taskenv:fail'
      }
    });

    var subject;
    setup(function() {
      subject = new TaskRunner(docker, task);
    });

    test('taskrunner-who result', function(done) {
      return subject.execute(process.stdout).then(
        function(result) {
          assert.equal(result.statusCode, 66);
        }
      );
    });
  });

  suite('#execute - lightsofapollo/test-taskenv:pass', function() {
    var token = '__UNIQ__';
    var task = TaskFactory.create({
      // give us a compelling exit code
      command: ['taskhost-who', token],

      machine: {
        image: 'lightsofapollo/test-taskenv:pass'
      }
    });

    var subject;
    setup(function() {
      subject = new TaskRunner(docker, task);
    });

    test('taskrunner-who result', function(done) {
      var gotUniq;
      var stream = new PassStream();

      stream._transform = function(data, type, done) {
        if (data.toString().trim() === token) gotUniq = true;
        done();
      };

      return subject.execute(stream).then(
        function(result) {
           //ensure we are getting stdout
          assert.equal(result.statusCode, 0);
          assert.ok(gotUniq, 'got __UNIQ__');
        }
      );
    });
  });

  suite('#destroy', function() {
    var task = TaskFactory.create({
      // give us a compelling exit code
      command: ['/bin/bash', '-c', 'echo woot'],

      machine: {
        // use generic ubuntu image
        image: 'ubuntu'
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
