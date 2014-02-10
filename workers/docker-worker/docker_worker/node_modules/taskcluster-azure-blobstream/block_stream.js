var stream = require('stream'),
    assert = require('assert'),
    Promise = require('promise');

/**
Initialize a stream to upload content to block blob storage.

@param {BlobService} service blob service from the azure module.
@param {String} container to upload into.
@param {String} blob to upload to.
@param {Object} [options] for the stream.
*/
function BlockStream(service, container, blob, options) {
  assert(service, 'service is required');
  assert(container, 'container is required');
  assert(blob, 'path is required');

  this.service = service;
  this.container = container;
  this.blob = blob;

  // incremented for each block pushed
  this._blockOffset = 0;

  // the previously committed blocks
  this._committedBlocks = [];

  stream.Writable.call(this, options);

  this._putBlock = Promise.denodeify(
    service.createBlobBlockFromText.bind(service)
  );

  this._commitBlocks = Promise.denodeify(
    service.commitBlobBlocks.bind(service)
  );

  this._setMetadata = Promise.denodeify(
    service.setBlobMetadata.bind(service)
  );

  this._setProperties = Promise.denodeify(
    service.setBlobProperties.bind(service)
  );

  this.once('finish', this._finalizeBlob.bind(this));
}

BlockStream.COMPLETE_HEADER = 'x-ms-meta-complete';

BlockStream.prototype = {
  __proto__: stream.Writable.prototype,
  _super: stream.Writable.prototype,

  /**
  When true the stream has finalized completely and the content is readable.
  @type Boolean
  */
  closed: false,
  contentType: 'text/plain',
  contentEncoding: 'utf8',

  // At the end of each stream we need to indicate the blob is done uploading.
  // We do this by adding a custom header via the blob metadata api.
  _finalizeBlob: function() {
    var promises = [
      this._setMetadata(this.container, this.blob, {
        complete: 1
      }),

      this._setProperties(this.container, this.blob, {
        contentTypeHeader: this.contentType,
        contentEncoding: this.contentEncoding
      })
    ];

    Promise.all(promises).then(
      // emit close but don't pass the result of set metadata
      function(result) {
        this.closed = true;
        this.emit('close');
      }.bind(this),

      this.emit.bind(this, 'error')
    );
  },

  _write: function(buffer, encoding, done) {
    var blockId = this.service.getBlockId(
      this.blob,
      this._blockOffset++
    );

    this._putBlock(
      blockId,
      this.container,
      this.blob,
      buffer
    ).then(
      function commitBlock() {
        // commits discard all blocks not listed by the commit so its important
        // to commit only while we are not also putting a block.

        var blockList = {
          // the blocks not yet seen in a commit
          UncommittedBlocks: [blockId]
        };

        if (this._committedBlocks.length) {
          // all the blocks we have already committed
          blockList.CommittedBlocks = this._committedBlocks;
        }

        return this._commitBlocks(
          this.container,
          this.blob,
          blockList
        );
      }.bind(this)
    ).then(
      function markBlockCommitted() {
        this._committedBlocks.push(blockId);
        done();
      }.bind(this),
      // handle errors
      done
    );
  }
};

module.exports = BlockStream;
