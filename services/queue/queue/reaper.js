var Promise = require('promise');
var debug = require('debug')('queue:reaper');

module.exports = function reaper(interval, Tasks, Events) {
  debug('initialized');

  function emitFailedMessage(task) {
    debug('task failed', task.taskId);
    var message = {
      version: '0.2.0',
      status: task
    };

    var run = task.runs[task.runs.length];
    if (run) {
      message.runId = run.runId;
      message.workerGroup = run.workerGroup;
      message.workerId = run.workerId;
    }

    return Events.publish('task-failed', message);
  }

  function emitPendingMessage(task) {
    debug('task pending', task.taskId);
    return Events.publish('task-pending', {
      version: '0.2.0',
      status: task
    });
  }

  function reapFailed() {
    debug('reaping failed');
    return Tasks.findAndUpdateFailed().
      then(function(list) {
        debug('failed tasks: ', list.length);
        return list.map(emitFailedMessage);
      });
  }

  function reapPending() {
    debug('reaping pending');
    return Tasks.findAndUpdatePending().
      then(function(list) {
        debug('pending tasks: ', list.length);
        return list.map(emitPendingMessage);
      });
  }

  function reap() {
    return Promise.all([reapPending(), reapFailed()]);
  }

  /**
  XXX: The interval handling is scary (ported from data.js) basically it calls the db every N seconds
       and hopes for the best regardless of success or failure.
  */
  var intervalHandler;

  return {
    start: function() {
      if (intervalHandler) {
        this.destroy();
      }

      debug('started will reap tasks every', interval, 'ms');
      intervalHandler = setInterval(reap, interval);
    },

    destroy: function() {
      clearInterval(intervalHandler);
    }
  };
};
