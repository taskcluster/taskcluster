/**
This is a test helper "rollup" intended to be used in integration testing the
public worker amqp interface.
*/
module.exports = function() {
  var server = require('./server');
  var worker = require('./worker')();

  var Promise = require('promise');
  var IronMQ = require('../ironmq');
  var queue = new IronMQ(worker.id);

  /**
  Starts a http server and runs a task (and reports back to the server)

  @param {Object} task definition to use for run.
  @param {Object} base properties for all task events.
  */
  return function runTask(task) {
    return new Promise(function(accept, reject) {
      var taskStatus = {};
      var request = {
        task: task,
        base: {},
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
            timeout: 60,
            expires_in: 60
          });
        },
        reject
      );
    });
  };
};
