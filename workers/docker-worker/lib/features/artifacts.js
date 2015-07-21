/**
This module handles all of the "artifact" (as defined by the worker) uploads and
deals with the extract of both single and multiple artifacts from the docker
container.
*/

var waitForEvent = require('../wait_for_event');
var _ = require('lodash');
var mime = require('mime');
var https = require('https');
var tarStream = require('tar-stream');
var debug = require('debug')('docker-worker:middleware:artifact_extractor');
var format = require('util').format;
var Promise = require('promise');
var url = require('url');

export default class Artifacts {
  async getPutUrl(handler, path, expires, contentType) {
    var queue = handler.runtime.queue;
    var result = await queue.createArtifact(
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
  }

  async uploadArtifact(taskHandler, name, artifact) {
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
    var contentStream;
    try {
      contentStream = await (new Promise((accept, reject) => {
        return container.copy({ Resource: path }, function(err, data) {
          if (err) reject(err);
          accept(data);
        });
      }));
    } catch (e) {
      // Log the error...
      taskHandler.stream.write(taskHandler.fmtLog(
        'Artifact "%s" not found at path "%s" skipping.',
        name, path
      ));

      // Create the artifact but as the type of "error" to indicate it is
      // missing.
      await queue.createArtifact(taskId, runId, name, {
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
    var entryHandler = async function (header, stream, cb) {
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
          await queue.createArtifact(taskId, runId, name, {
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
        cb();
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
        await ctx.getPutUrl(taskHandler, entryName, expiry, contentType);

      let parsedUrl = url.parse(putUrl);
      let options = {
        hostname: parsedUrl.hostname,
        path: parsedUrl.path,
        method: 'PUT',
        headers: {
          'Content-Type': contentType,
          'Content-Length': contentLength,
        }
      };

      var putReq = https.request(options);

      // Stream tar entry to request before ending the request
      stream.pipe(putReq);

      var response;
      try {
        response = await new Promise((accept, reject) => {
          putReq.on('response', (res) => { accept(res); });
          putReq.on('error', (err) => { reject(err); });
        });
        // Flush the data from the reponse so it's not held in memory
        response.resume();

        // If there was an error uploading the artifact note that in the result.
        if (response.statusCode !== 200) {
          taskHandler.stream.write(taskHandler.fmtLog(
            'Artifact "%s" failed to upload "%s" error code: %s',
            name,
            header.name,
            response.statusCode
          ));
        }
      } catch(err) {
        taskHandler.stream.write(taskHandler.fmtLog(
          'Artifact "%s" failed to upload "%s" error: %s',
          name,
          header.name,
          err
        )); 
      }
      // Resume the stream if there is an upload failure otherwise
      // stream will never emit 'finish'
      stream.resume();
      cb();
    };

    // Individual tar entry.
    tarExtract.on('entry', entryHandler);

    // Wait for the tar to be finished extracting.
    await waitForEvent(tarExtract, 'finish');
    return;
  }

  async stopped(taskHandler) {
    // Can't create artifacts for a task that's been canceled
    if (taskHandler.isCanceled()) return;

    var queue = taskHandler.runtime.queue;
    var artifacts = taskHandler.task.payload.artifacts;
    var errors = {};

    // Artifacts are optional...
    if (typeof artifacts !== 'object') return;

    // Upload all the artifacts in parallel.
    await Promise.all(_.map(artifacts, (value, key) => {
      return this.uploadArtifact(taskHandler, key, value).catch((err) => {
        errors[key] = err;
      });
    }));

    if (errors.length > 0) {
      _.map(errors, (value, key) => {
        debug('Artifact upload %s failed, error: %s, as JSON: %j', key, value, value, value.stack);
      });
      throw new Error('Artifact uploads %s failed', Object.keys(errors));
    }
  }

};
