/**
Times middleware keeps track of the starting and ending times of a task.
*/
function Times() {
  var started;
  return {
    start: function(claim, value) {
      started = Date.now();
      return claim;
    },

    stop: function(value) {
      value.startTimestamp = started;
      value.stopTimestamp = Date.now();
      return value;
    }
  };
}

module.exports = Times;
