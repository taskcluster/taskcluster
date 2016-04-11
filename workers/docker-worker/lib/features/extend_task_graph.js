/**
This module handles extending the task graph as a by-product of a task's run.
*/
var debug = require('debug')('docker-worker:middleware:extendTaskGraph');
var waitForEvent = require('../wait_for_event');
var tarStream = require('tar-stream');
var log = require('../log');
var taskcluster = require('taskcluster-client');


async function drain (listener) {
  var buffer = '';

  listener.on('data', function(data) {
    buffer += data;
  });

  await waitForEvent(listener, 'end');
  return buffer;
}

export default class ExtendTaskGraph {
  constructor () {
    this.featureName = 'extendTaskGraph';
  }

  async extendTaskGraph(taskHandler, graphPath) {
    var task = taskHandler.task;
    var graphId = task.taskGroupId;

    var container = taskHandler.dockerProcess.container;
    var scheduler = new taskcluster.Scheduler({
      credentials: taskHandler.claim.credentials
    });

    // Raw tar stream for the content.
    var contentStream;
    try {
      contentStream = await container.copy({ Resource: graphPath });
    } catch (e) {
      // Let the consumer know the graph file cannot be found.
      taskHandler.stream.write(log.fmtErrorLog(
        'Graph extension not found at path "%s" skipping...',
        graphPath
      ));
      return;
    }

    var tarExtract = tarStream.extract();

    // Begin unpacking the tar.
    contentStream.pipe(tarExtract);

    // Individual tar entry.
    var checkTarType = true;
    // JSON used to extend the task graph (not parsed).
    var entryJSON;

    tarExtract.on('entry', async (header, stream, cb) => {
      if (checkTarType) {
        checkTarType = false;
        if (header.type !== 'file') {
          // Destroy the stream and manually emit the finish event so we can
          // continue on to the next graph or exit.
          stream.destroy();
          stream.emit('finish');
          throw new Error(
            'Unexpected multiple files in task graph extension path.'
          );
        }
      }
      // Consume the stream and store the raw json here.
      entryJSON = await drain(stream);
      cb();
    });

    // Wait for the tar to be finished extracting.
    await waitForEvent(tarExtract, 'finish');

    // Parse the json to ensure it is valid on our end.
    var extension;
    try {
      extension = JSON.parse(entryJSON);
    } catch (e) {
      throw new Error(
        'Invalid json in taskgraph extension path: "' + graphPath + '". ' +
        'Dumping file. ' + JSON.stringify(entryJSON, null, 2)
      );
    }
    // Extend the graph!
    try {
      var result = await scheduler.extendTaskGraph(graphId, extension);
      taskHandler.stream.write(log.fmtLog(
        'Successfully extended graph id: "%s" with "%s".',
        graphId, graphPath
      ));
    } catch (error) {
      throw new Error(
        'Graph server error while extending task graph id ' + graphId + ' : ' +
        error.message + ', ' + JSON.stringify(error.body.error)
      );
    }
  }

  async stopped(taskHandler) {
    // No need to update the graph if task is canceled
    if (taskHandler.isCanceled()) return;

    var task = taskHandler.task;
    var payload = task.payload;

    // graphs are optional...
    if (!payload.graphs) return;

    // If there is no scheduler id we cannot extend the graph.
    if (task.schedulerId !== 'task-graph-scheduler') {
      throw new Error(
        'No taskGroupId (task graph id) extension is not possible'
      );
    }

    // Iterate through the graphs extending where possible.
    let errors = [];
    await Promise.all(payload.graphs.map(async (graph) => {
      await this.extendTaskGraph(taskHandler, graph).catch(error => errors.push(error));
    }));

    if (errors.length > 0) {
      throw new Error(
        'Error encountered when attempting to extend task graph. ' +
        errors.map(e => e.message).join(' | ')
      );
    }

    taskHandler.stream.write(log.fmtLog('Done extending graph'));
  }
}
