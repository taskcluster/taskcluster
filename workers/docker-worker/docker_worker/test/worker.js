var spawn = require('child_process').spawn;

/**
Rather then test the interface we test through the amqp queue.
*/
function startConsumer() {
  var binary = __dirname + '/../bin/worker';
  var result = {};

  function earlyExit() {
    throw new Error('process exited early');
  }

  setup(function() {
    var envs = {};
    for (var key in process.env) envs[key] = process.env[key];

    result.proc = spawn(binary, ['start', 'tasks'], {
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

  return result;
}

module.exports = startConsumer;
