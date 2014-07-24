var request     = require('superagent-promise');
var debug       = require('debug')('azure-blob-uploader-sas');
var assert      = require('assert');
var urljoin     = require('url-join');
var querystring = require('querystring');
var _           = require('lodash');
var xmlbuilder  = require('xmlbuilder');

/**
 * Utility to upload block blobs using an azure Shared-Access-Signature
 *
 * Takes a input sas on the following form:
 * {
 *   baseUrl:       // Base url for azure blob storage account
 *   path:          // Path to resources
 *   queryString: { // Query string parameters with SAS
 * }
 */
var BlobUploader = function(sas) {
  assert(sas.baseUrl,     "Must have baseUrl");
  assert(sas.path,        "Must have path");
  assert(sas.queryString, "Must have queryString with SAS");
  this.sas = sas;
};

// Export BlobUploader
module.exports = BlobUploader;

/** Construct URL for azure blob storage */
BlobUploader.prototype.buildUrl = function(queryString) {
  // Merge querystring parameters
  queryString = _.defaults(queryString || {}, this.sas.queryString);
  // Build url
  return urljoin(
    this.sas.baseUrl,
    this.sas.path,
    '?' + querystring.stringify(queryString)
  );
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

