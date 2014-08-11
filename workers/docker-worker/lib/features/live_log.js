/**
Live logging handler reads data from `task.stream` and writes to azure as data
is streamed from the task container and other writers...
*/

var azure = require('azure-storage');
var querystring = require('querystring');
var waitForEvent = require('../wait_for_event');
var streamClosed = require('../stream_closed');

var URL = require('url')
var Promise = require('promise');
var BlobStream = require('taskcluster-azure-blobstream');

var ARTIFACT_NAME = 'public/logs/terminal_live.log';

/**
Constructs a blob stream from a SAS url.

@param {String} url for sas.
@return {BlobStream} configured blob stream.
*/
function azureBlobStreamFromUrl(url) {
  // Azure cares about four distinct things:
  //
  // 1. The "host".
  // 2. The "container".
  // 3. The "key" of the blob.
  // 4. The "sas" as a query string.
  // Example: http://$host.com/$container/$key?$sas
  var parsed = URL.parse(url);

  // The "host" contains both the protocol and domain.
  var host = parsed.protocol + '//' + parsed.host;

  var pathParts = parsed.pathname.split('/');

  // The first path part is the "container".
  var container = pathParts[1];
  // The rest is the blob key...
  var key = pathParts.slice(2).join('/');
  // Signature for the blob container.
  var sas = parsed.query;

  var blobService = azure.createBlobServiceWithSas({ primaryHost: host }, sas);
  return new BlobStream(blobService, container, key);
}

function LiveLog() {};

LiveLog.prototype = {
  created: function* (task) {
    var queue = task.runtime.queue;

    // Create date when this artifact should expire (see config).
    var expiration =
      new Date(Date.now() + task.runtime.conf.get('logging:liveLogExpires'));

    var options = {
      storageType: 'azure',
      expires: expiration,
      contentType: 'text/plain'
    };

    task.runtime.log('create log', {
      taskId: task.status.taskId,
      runId: task.status.runId,
      path: ARTIFACT_NAME,
      options: options
    });

    var artifact = yield queue.createArtifact(
      task.status.taskId,
      task.runId,
      ARTIFACT_NAME,
      options
    );

    this.stream = azureBlobStreamFromUrl(artifact.putUrl);
    task.stream.pipe(this.stream);
  },

  killed: function* (task) {
    // Ensure the live logger has completely been written.
    yield streamClosed(this.stream);
  }
};

module.exports = LiveLog;
