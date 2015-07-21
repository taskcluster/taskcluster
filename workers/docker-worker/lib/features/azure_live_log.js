/**
Live logging handler reads data from `task.stream` and writes to azure as data
is streamed from the task container and other writers...
*/

var azure = require('azure-storage');
var streamClosed = require('../stream_closed');

var URL = require('url')
var Promise = require('promise');
var TimeChunkedStream = require('time-chunked-stream');
var BlobStream = require('taskcluster-azure-blobstream');

var ARTIFACT_NAME = 'public/logs/azure_live.log';

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

export default class LiveLog {
  constructor () {}

  async created(task) {
    var queue = task.runtime.queue;

    // Create date when this artifact should expire (see config).
    var expiration =
      new Date(Date.now() + task.runtime.logging.liveLogExpires);

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

    var artifact = await queue.createArtifact(
      task.status.taskId,
      task.runId,
      ARTIFACT_NAME,
      options
    );

    // XXX: Azure has hard limits on number of writes buffer them by interval.
    this.stream = new TimeChunkedStream({
      timeout: task.runtime.logging.liveLogChunkInterval
    });
    this.stream.pipe(azureBlobStreamFromUrl(artifact.putUrl));
    task.stream.pipe(this.stream);
  }

  async killed(task) {
    // Ensure the live logger has completely been written.
    await streamClosed(this.stream);
  }
}
