var ContainerMetrics = require('../metrics/container');

/**
Times middleware keeps track of the starting and stoping times of a task.
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

    stop: function(stop) {
      handler.stop();
      return stop;
    }
  };
}

module.exports = Metrics;
