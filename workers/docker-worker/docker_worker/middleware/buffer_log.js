/**
 * Middleware for using the simple "ghetto" buffer
 */
var GhettoStream = require('../ghetto_stream');
function BufferLog(flag) {
  if (!flag) {
    return null;
  }
  var stream = new GhettoStream();

  return {
    start: function(claim, task, dockerProcess) {
      dockerProcess.stdout.pipe(stream);
      return claim;
    },

    extractResult: function(result) {
      // stream as text output for our alpha version / debugging
      result.result.logText = stream.text;
      return result;
    }
  };
}

BufferLog.featureFlagName    = 'bufferLog';
BufferLog.featureFlagDefault = false;

module.exports = BufferLog;
