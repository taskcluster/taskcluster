var azure             = require('azure');
var uuid              = require('uuid');
var BlobStream        = require('taskcluster-azure-blobstream');
var Promise           = require('promise');
var TimeChunkedStream = require('time-chunked-stream');

/** Build an Azure live log middleware instance */
var AzureLiveLogBuilder = function(flag) {
  if (flag) {
    return new AzureLiveLog();
  }
  return null;
};

function AzureLiveLog(flag) {
  // Rely on azure's werid environment variables for now to auth...
  this.blobService = azure.createBlobService();
  this.createContainer =
    Promise.denodeify(this.blobService.createContainerIfNotExists.bind(
      this.blobService
    ));
}

AzureLiveLog.prototype = {

  /**
  Ensure the azure container exists then create a new blob stream to pipe
  the docker output into.
  */
  declareLogs: function(logs, taskRun, dockerProcess) {
    var container;
    var url;
    var path;

    path = this.path = uuid.v4();
    // XXX: This needs to be configurable
    container = this.container = 'taskclusterlogs';
    url = this.url = this.blobService.getBlobUrl(container, path);

    // add the log url to the logs so consumers can read from it immediately.
    logs['terminal.log'] = url;

    return this.createContainer(
      container,
      // list, get, etc... are public
      { publicAccessLevel: 'container' }
    ).then(
      function pipeToAzure() {
        this.stream = new BlobStream(this.blobService, container, path);
        dockerProcess.stdout
          .pipe(new TimeChunkedStream({
            timeout:  5000
          }))
          .pipe(this.stream);
        return logs;
      }.bind(this)
    );
  },

  extractResult: function(result) {
    if (this.stream.closed) return result;

    return new Promise(
      function(accept, reject) {
        this.stream.once('close', accept.bind(null, result));
        this.stream.once('error', reject);
      }.bind(this)
    );
  }
};

AzureLiveLogBuilder.featureFlagName    = 'azureLiveLog';
AzureLiveLogBuilder.featureFlagDefault = true;

module.exports = AzureLiveLogBuilder;
