var request     = require('superagent-promise');
var url         = require('url');
var debug       = require('debug')('test:azure-blob-uploader-sas');
var assert      = require('assert');
var qs          = require('querystring');
var _           = require('lodash');
var xmlbuilder  = require('xmlbuilder');

/**
 * Utility to upload block blobs using an azure Shared-Access-Signature
 *
 * @param {String} url fully constructed sas endpoint.
 */
var BlobUploader = function(url) {
  this.url = url;
};

// Export BlobUploader
module.exports = BlobUploader;

/** Construct URL for azure blob storage */
BlobUploader.prototype.buildUrl = function(queryString) {
  // Extend the query parameters if given....
  var parsed       = url.parse(this.url, true);
  parsed.search    = '?' + qs.stringify(
    _.defaults(queryString || {}, parsed.query));

  return url.format(parsed);
};

/** Upload a single block for commit later */
BlobUploader.prototype.putBlock = function(blockId, block) {
  assert(blockId, "blockId must be given");
  assert(block,   "block must be given");

  // Construct URL
  var url = this.buildUrl({
    comp:     'block',
    blockid:  new Buffer('' + blockId).toString('base64')
  });

  // Send request
  return request
          .put(url)
          .send(block)
          .end()
          .then(function(res) {
            // Check for success
            if (!res.ok) {
              debug("putBlock failed, error code: %s", res.status);
              throw new Error("Failed putBlock");
            }
            // Return blockId
            return blockId;
          });
};

/** Commit a list of blocks as the blob */
BlobUploader.prototype.putBlockList = function(blockIds, contentType) {
  assert(blockIds instanceof Array, "blockIds must be an array")
  assert(contentType, "contentType must be given");
  // Construct URL
  var url = this.buildUrl({
    comp:     'blocklist'
  });
  // Construct XML
  var blockList = xmlbuilder.create('BlockList', {
    version:    '1.0',
    encoding:   'utf-8'
  });
  blockIds.forEach(function(blockId) {
    var id = new Buffer('' + blockId).toString('base64');
    blockList.element('Latest', id);
  });
  var xml = blockList.end({
    pretty:     true
  });
  // Send request
  return request
          .put(url)
          .set('x-ms-blob-content-type',  contentType)
          .send(xml)
          .end()
          .then(function(res) {
            // Check for success
            if (!res.ok) {
              debug("putBlockList failed, error code: %s", res.status);
              throw new Error("Failed putBlockList");
            }
          });
};

