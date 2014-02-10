var azure = require('azure');
var uuid = require('uuid');
var BlobStream = require('taskcluster-azure-blobstream');
var Promise = require('promise');

function AzureLiveLog() {
  if (!(this instanceof AzureLiveLog)) return new AzureLiveLog();
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
  start: function(claim, task, dockerProcess) {
    var container;
    var url;
    var path;

    path = this.path = uuid.v4();
    // XXX: This needs to be configurable
    container = this.container = 'taskclusterlogs';
    url = this.url = this.blobService.getBlobUrl(container, path);

    // add the log url to the claim so consumers can read from it immediately.
    claim.log = url;

    return this.createContainer(
      container,
      // list, get, etc... are public
      { publicAccessLevel: 'container' }
    ).then(
      function pipeToAzure() {
        this.stream = new BlobStream(this.blobService, container, path);
        dockerProcess.stdout.pipe(this.stream);
        return claim;
      }.bind(this)
    );
  },

  end: function(output) {
    output.artifacts.log = this.url;
    if (this.stream.closed) return output;

    return new Promise(
      function(accept, reject) {
        this.stream.once('close', accept.bind(null, output));
        this.stream.once('error', reject);
      }.bind(this)
    );
  }
};

module.exports = AzureLiveLog;
