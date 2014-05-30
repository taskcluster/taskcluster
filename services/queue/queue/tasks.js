var Promise = require('promise');
var urljoin = require('url-join');
var debug   = require('debug')('queue:tasks');
var aws     = require('aws-sdk-promise');
var _       = require('lodash');
var assert  = require('assert');

/**
 * Create a task storage facility. This class abstracts access to S3, so that
 * we can switch to Azure if we want to.
 *
 * options:
 * {
 *   aws:            // AWS credentials and region
 *   bucket:         // S3 bucket
 *   publicBaseUrl:  // Prefix for public urls, null, if none
 * }
 */
var Tasks = function(options) {
  assert(options.bucket, "Bucket must be provided");

  // Create S3 instance with bucket parameter bound
  this._s3 = new aws.S3(_.defaults({
    params: {
      Bucket:       options.bucket
    }
  }, options.aws || {});

  // Set publicBaseUrl
  this._publicBaseUrl = options.publicBaseUrl || this._s3.endpoint.href;
};

/** Get object from path (returns a promise) */
Tasks.prototype.get = function(path) {
  return this._s3.getObject({Key: path}).promise().then(function(res) {
    return JSON.parse(res.data.Body.toString('utf8'));
  }).catch(function(err) {
    if (err.code === 'NoSuchKey') {
      return null;
    }
    throw err;
  });
};

/** Put object to path (returns a promise) */
Tasks.prototype.put = function(path, object) {
  return this._s3.putObject({
    Key:            path,
    Body:           JSON.stringify(object),
    ContentType:    'application/json'
  }).promise();
};

/** Get signed Put URL for path (returns a promise) */
Tasks.prototype.signedPutUrl = function(path, timeout, contentType) {
  var signedUrl = Promise.denodeify(this._s3.getSignedUrl.bind(this._s3));
  return signedUrl('putObject', {
    Key:          path,
    ContentType:  contentType || 'application/json',
    Expires:      timeout
  });
};


/** Get public access URL */
Tasks.prototype.publicUrl = function(path) {
  return urljoin(this._publicBaseUrl, path);
};

// Export Tasks
module.exports = Tasks;
