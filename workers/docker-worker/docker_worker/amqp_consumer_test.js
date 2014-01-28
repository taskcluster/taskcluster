suite('consumer', function() {
  var server = require('./test/server');
  var amqp = require('./test/amqp')();
  var worker = require('./test/worker')();

  var Publisher = require('amqpworkers/publisher');
  var Message = require('amqpworkers/message');
  var TaskFactory = require('taskcluster-task-factory/task');
  var Promise = require('promise');

  var publisher;
  setup(function() {
    publisher = new Publisher(amqp.connection);
  });

  /**
  Starts a http server and runs a task (and reports back to the server)
  */
  function runTask(task) {
    return new Promise(function(accept, reject) {
      var taskStatus = {};
      var request = {
        job: task
      };

      server().then(
        function serverListening(testServer) {
          request.claim = testServer.endpoint('post', function(req, res) {
            taskStatus.claimed = true;
            res.send(200);
          });

          request.finish = testServer.endpoint('post', function(req, res) {
            taskStatus.finish = req.body;
            res.send(200);
            accept(taskStatus);
          });
        }
      ).then(
        function() {
          return publisher.publish(
            '',
            'tasks',
            new Message(request)
          );
        },
        reject
      );
    });
  }

  test('successful task', function() {
    var task = TaskFactory.create({
      command: ['echo', 'first command!'],
      parameters: {
        docker: { image: 'ubuntu' }
      }
    });

    return runTask(task).then(
      function(taskStatus) {
        assert.ok(taskStatus.claimed);
        var result = taskStatus.finish.result;

        assert.ok(result.extra_info.log.indexOf('first command') !== -1);
        assert.equal(result.task_result.exit_status, 0);
      }
    );
  });
});
