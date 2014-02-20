/**
This is a test helper "rollup" intended to be used in integration testing the
public worker amqp interface.
*/
module.exports = function(worker) {
  var server = require('./server');
  worker = worker || require('./worker')();

  var Promise = require('promise');
  var IronMQ = require('../ironmq');
  var queue = new IronMQ(worker.id);

  /**
  Starts a http server and runs a task (and reports back to the server)

  @param {Object} task definition to use for run.
  @param {Number} timeout before task expires.
  */
  return function runTask(task, timeout) {
    return new Promise(function(accept, reject) {
      timeout = timeout || 60;

      var taskStatus = {};
      var request = {
        task: task
      };

      server().then(
        function serverListening(testServer) {
          request.start = testServer.endpoint('post', function(req, res) {
            taskStatus.start = req.body;
            res.send(200);
          });

          request.stop = testServer.endpoint('post', function(req, res) {
            taskStatus.stop = req.body;
            res.send(200);
            accept(taskStatus);
          });
        }
      ).then(
        function() {
          var body = JSON.stringify(request);
          return queue.post({
            body: body,
            timeout: timeout,
            expires_in: 60
          });
        },
        reject
      );
    });
  };
};
