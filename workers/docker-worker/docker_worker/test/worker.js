var spawn = require('child_process').spawn;
var uuid = require('uuid');
var IronMQ = require('../ironmq');

/**
Rather then test the interface we test through the amqp queue.
*/
function startConsumer(id) {
  id = id || uuid.v4();
  var binary = __dirname + '/../bin/worker';
  var result = { id: id };

  function earlyExit() {
    throw new Error('process exited early');
  }

  setup(function() {
    var envs = {};
    for (var key in process.env) envs[key] = process.env[key];

    result.proc = spawn(binary, ['start', id, '--interval', '100'], {
      env: envs,
      // share all the file descriptors so we see pretty debug output
      stdio: 'inherit'
    });
    result.proc.once('exit', earlyExit);
  });

  teardown(function() {
    result.proc.removeListener('exit', earlyExit);
    result.proc.kill();
  });

  teardown(function() {
    var mq = new IronMQ(id);
    return mq.del_queue();
  });

  return result;
}

module.exports = startConsumer;
