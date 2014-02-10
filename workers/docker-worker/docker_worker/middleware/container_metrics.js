var ContainerMetrics = require('../metrics/container');

/**
Times middleware keeps track of the starting and ending times of a task.
*/
function Metrics(group) {
  var handler = new ContainerMetrics(group);

  return {
    start: function(start, task, dockerProc) {
      handler.metrics.job = task.data;

      dockerProc.once('container start', function(container) {
        handler.poll(container);
      });

      return start;
    },

    end: function(end) {
      handler.stop();
      return end;
    }
  };
}

module.exports = Metrics;
