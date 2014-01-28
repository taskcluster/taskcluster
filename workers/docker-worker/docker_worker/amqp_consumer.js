var Consumer = require('amqpworkers/consumer');
var TaskRunner = require('./taskrunner');
var JobAPI = require('./job_api');

var debug = require('debug')('taskclsuter-docker-worker:amqp_consumer');

var ghettoStream = require('./ghetto_stream');
var stream = require('stream');
var assert = require('assert');

function AMQPConusmer(options) {
  assert(options.docker, '.docker option is given');
  assert(options.amqp, '.amqp option is given');

  Consumer.call(this, options.amqp);
  this.docker = options.docker;
}

AMQPConusmer.prototype = {
  __proto__: Consumer.prototype,

  /**
  Handle a message from the incoming queue.
  */
  read: function(message) {
    // running time details of this task
    var times = {
      started_timestamp: Date.now()
    };

    // task result/output
    var output = {
      times: times
    };

    var stream = ghettoStream();
    var api = new JobAPI(message);
    var taskRunner = new TaskRunner(this.docker, api.job);

    return api.sendClaim().then(
      function initiateExecute(value) {
        return taskRunner.execute(stream);
      }
    ).then(
      function executeResult(result) {
        // stream as text output for our alpha version
        output.extra_info = {
          log: stream.text
        };

        output.task_result = {
          exit_status: result.statusCode
        };

        times.finished_timestamp = Date.now();

        // / 1000 since this is JS and we are in MS land.
        times.runtime_seconds =
          (times.finished_timestamp - times.started_timestamp) / 1000;

        // send the result
        return api.sendFinish(output).then(
          // remove the container
          function() {
            return taskRunner.destroy();
          }
        );
      },
      function epicFail(err) {
        // XXX: this should either nack or "finish" with an error.
        debug('FAILED to process task', err);
      }
    );
  }
};

module.exports = AMQPConusmer;
