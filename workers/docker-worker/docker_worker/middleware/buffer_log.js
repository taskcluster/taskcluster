/**
Middleware for using the simple "ghetto" buffer
*/

var GhettoStream = require('../ghetto_stream');
function BufferLog() {
  var stream = new GhettoStream();

  return {
    start: function(claim, task, dockerProcess) {
      dockerProcess.stdout.pipe(stream);
      return claim;
    },

    stop: function(output) {
      // stream as text output for our alpha version / debugging
      output.logText = stream.text;
      return output;
    }
  };
}

module.exports = BufferLog;
