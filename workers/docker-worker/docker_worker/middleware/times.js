/**
Times middleware keeps track of the starting and ending times of a task.
*/
var Times = function(flag) {
  // This middleware should always be on, regardless of the flag given
  var started;
  return {
    start: function(value) {
      started = Date.now();
      return value;
    },

    extractResult: function(result) {
      result.startTimestamp = started;
      result.stopTimestamp = Date.now();
      return result;
    }
  };
};

Times.featureFlagName    = 'times';
Times.featureFlagDefault = true;

module.exports = Times;
