/**
This module handles all of the "artifact" (as defined by the worker) uploads and
deals with the extract of both single and multiple artifacts from the docker
container.
*/

var waitForEvent = require('../wait_for_event');
var coPromise = require('co-promise');
var co = require('co');
var mime = require('mime');
var request = require('superagent-promise');
var tarStream = require('tar-stream');
var debug = require('debug')('docker-worker:middleware:artifact_extractor');
var format = require('util').format;
var Promise = require('promise');

function Artifacts() {}

Artifacts.prototype = {

  getPutUrl: function* (handler, path, expires, contentType) {
    var queue = handler.runtime.queue;
    var result = yield queue.createArtifact(
      handler.status.taskId,
      handler.runId,
      path,
      {
        // We have a bias for s3 but azure would work just as well...
        storageType: 's3',
        expires: expires,
        contentType: contentType
      }
    );

    return result.putUrl;
  },

  uploadArtifact: function* (taskHandler, name, artifact) {
    var container = taskHandler.dockerProcess.container;
    var queue = taskHandler.runtime.queue;
    var path = artifact.path;
    var expiry = artifact.expires;

    // Task specific information needed to generated signed put requests.
    var taskId = taskHandler.status.taskId;
    var runId = taskHandler.claim.runId;
    var workerId = taskHandler.runtime.workerId;
    var workerGroup = taskHandler.runtime.workerGroup;

    // Raw tar stream for the content.
    try {
      var contentStream = yield container.copy({ Resource: path });
    } catch (e) {
      // Log the error...
      taskHandler.stream.write(taskHandler.fmtLog(
        'Artifact "%s" not found at path "%s" skipping.',
        name, path
      ));

      // Create the artifact but as the type of "error" to indicate it is
      // missing.
      yield queue.createArtifact(taskId, runId, name, {
        storageType: 'error',
        expires: expiry,
        reason: 'file-missing-on-worker',
        message: 'Artifact not found in path: "' + path  + '"'
      });

      return;
    }

    var tarExtract = tarStream.extract();

    // Begin unpacking the tar.
    contentStream.pipe(tarExtract);

    var ctx = this;
    var checkedArtifactType = false;
    var entryHandler = co(function* (header, stream) {
      // The first item in the tar should always match the intended artifact
      // type.
      if (!checkedArtifactType) {
        // Only check once! Tar is ordered and docker gives us consistent
        // contents so we do not need to check more then once.
        checkedArtifactType = true;
        if (header.type !== artifact.type) {
          // Remove the entry listener immediately so no more entries are consumed
          // while uploading the error artifact.
          tarExtract.removeListener('entry', entryHandler);

          // Make it clear that you must expected either files or directories.
          yield queue.createArtifact(taskId, runId, name, {
            storageType: 'error',
            expires: expiry,
            reason: 'invalid-resource-on-worker',
            message: format(
              'Expected artifact to be a "%s" was "%s"',
              artifact.type, header.type
            )
          });

          // Destroy the stream.
          tarExtract.destroy();
          // Notify the `finish` listener that we are done.
          tarExtract.emit('finish');
          return;
        }
      }

      // Skip any entry type that is not an artifact for uploads...
      if (header.type !== 'file') {
        stream.resume();
        return;
      }

      // Trim the first part of the path off the entry.
      var entryName = name;
      var entryPath = header.name.split('/');
      entryPath.shift();
      if (entryPath.length && entryPath[0]) {
        entryName += '/' + entryPath.join('/');
      }

      var contentType = mime.lookup(header.name);
      var contentLength = header.size;
      var putUrl =
        yield ctx.getPutUrl(taskHandler, entryName, expiry, contentType);

      // Put the artifact on the server.
      var putReq = request.put(putUrl).set({
        'Content-Length': contentLength,
        'Content-Type': contentType
      });

      // Stream tar entry to request before ending the request
      stream.pipe(putReq);

      putReq.end();

      // Wait until the response is sent.
      var res = yield waitForEvent(putReq, 'response');

      // If there was an error uploading the artifact note that in the result.
      if (res.error) {
        taskHandler.stream.write(taskHandler.fmtLog(
          'Artifact "%s" failed to upload "%s" error code: %s',
          name,
          header.name,
          res.status
        ));

        // Resume the stream if there is an uplaod failure otherwise
        // stream will never emit 'finish'
        stream.resume();
      }

      // Wait until the requset is fuly completed.
      yield waitForEvent(putReq, 'end');
    });

    // Individual tar entry.
    tarExtract.on('entry', entryHandler);

    // Wait for the tar to be finished extracting.
    yield waitForEvent(tarExtract, 'finish');
  },

  stopped: function* (taskHandler) {
    var queue = taskHandler.runtime.queue;
    var artifacts = taskHandler.task.payload.artifacts;

    // Artifacts are optional...
    if (typeof artifacts !== 'object') return;

    // Upload all the artifacts in parallel.
    yield Object.keys(artifacts).map(function(key) {
      return this.uploadArtifact(taskHandler, key, artifacts[key]);
    }, this);
  }

};

module.exports = Artifacts;
