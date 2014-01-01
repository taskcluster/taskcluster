suite('run_task', function() {
  var Promise = require('promise'),
      TaskFactory = require('taskcluster-task-factory'),
      Docker = require('dockerode'),
      TaskRunner = require('./taskrunner'),
      PassStream = require('stream').PassThrough;

  var docker;
  setup(function() {
    docker = new Docker({
      host: 'http://localhost', port: 60034
    });
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
        // use generic ubuntu image
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
        // use generic ubuntu image
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
});
