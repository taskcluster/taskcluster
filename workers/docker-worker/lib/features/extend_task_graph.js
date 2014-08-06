/**
This module handles extending the task graph as a by-product of a task's run.
*/
var co = require('co');
var waitForEvent = require('../wait_for_event');
var tarStream = require('tar-stream');

function* drain (listener) {
  var buffer = '';

  listener.on('data', function(data) {
    buffer += data;
  });

  yield waitForEvent(listener, 'end');
  return buffer;
}

function ExtendTaskGraph() {}

ExtendTaskGraph.prototype = {

  extendTaskGraph: function* (taskHandler, graphPath) {
    var task = taskHandler.task;
    var graphId = task.taskGroupId;

    var container = taskHandler.dockerProcess.container;
    var scheduler = taskHandler.runtime.scheduler;

    // Raw tar stream for the content.
    try {
      var contentStream = yield container.copy({ Resource: graphPath });
    } catch (e) {
      // Let the consumer know the graph file cannot be found.
      taskHandler.stream.write(taskHandler.fmtLog(
        'Graph extension not found at path "%s" skipping...',
        graphPath
      ))
      return;
    }

    var tarExtract = tarStream.extract();

    // Begin unpacking the tar.
    contentStream.pipe(tarExtract);

    // Individual tar entry.
    var checkTarType = true;
    // JSON used to extend the task graph (not parsed).
    var entryJSON;

    tarExtract.on('entry', co(function* (header, stream) {
      if (checkTarType) {
        checkTarType = false;
        if (header.type !== 'file') {
          taskHandler.stream.write(taskHandler.fmtLog(
            'Unexpected multiple files in task graph extension path'
          ));
          // Destroy the stream and manually emit the finish event so we can
          // continue on to the next graph or exit.
          stream.destroy();
          stream.emit('finish');
          return;
        }
      }
      // Consume the stream and store the raw json here.
      entryJSON = yield drain(stream);
    }));

    // Wait for the tar to be finished extracting.
    yield waitForEvent(tarExtract, 'finish');

    // Parse the json to ensure it is valid on our end.
    var extension;
    try {
      extension = JSON.parse(entryJSON);
    } catch (e) {
      taskHandler.stream.write(taskHandler.fmtLog(
        'Invalid json in taskgraph extension path: "%s" dumping file...'
      ));
      taskHandler.stream.write(entryJSON)
      return;
    }

    // Extend the graph!
    // TODO: Add logging to indicate task graph extension...
    try {
      var result = yield scheduler.extendTaskGraph(graphId, extension);
      taskHandler.stream.write(taskHandler.fmtLog(
        'Successfully extended graph id: "%s" with "%s".',
        graphId, graphPath
      ));
    } catch (error) {
      taskHandler.stream.write(taskHandler.fmtLog(
        'Graph server error while extending task graph id %s : %s',
        graphId, error
      ));
      return;
    }
  },

  stopped: function* (taskHandler) {
    var task = taskHandler.task;
    var payload = task.payload;

    // graphs are optional...
    if (!payload.graphs) return;

    // If there is no scheduler id we cannot extend the graph.
    if (task.schedulerId !== 'task-graph-scheduler') {
      return taskHandler.stream.write(taskHandler.fmtLog(
        "No taskGroupId (task graph id) extension is not possible"
      ));
    }

    // Iterate through the graphs extending where possible.
    var extensions = payload.graphs.map(function(graph) {
      return this.extendTaskGraph(taskHandler, graph);
    }, this);

    yield extensions;
    taskHandler.stream.write(taskHandler.fmtLog("Done extending graph"));
  },
};

module.exports = ExtendTaskGraph;
