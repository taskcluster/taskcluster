var aws         = require('aws-sdk-promise');
var _           = require('lodash');
var debug       = require('debug')('queue:bucket');
var assert      = require('assert');
var Promise     = require('promise');

/**
 * Create S3 bucket wrapper.
 *
 * options:
 * {
 *   bucket:             // S3 bucket to use
 *   credentials: {
 *     accessKeyId:      // ...
 *     secretAccessKey:  // ...
 *   }
 * }
 */
var Bucket = function(options) {
  assert(options,             "options must be given");
  assert(options.bucket,      "bucket must be specified");
  assert(options.credentials, "credentials must be specified");
  // Ensure access to the bucket property
  this.bucket = options.bucket;
  // Create S3 client
  this.s3 = new aws.S3(_.defaults({
    params: {
      Bucket:   options.bucket
    }
  }, options.credentials));
};

// Export Bucket
module.exports = Bucket;

/**
 * Create a signed PUT URL
 *
 * options:
 * {
 *   contentType:    // Object content type
 *   expires:        // Seconds to URL expiry
 * }
 */
Bucket.prototype.createPutUrl = function(prefix, options) {
  assert(prefix,                "prefix must be given");
  assert(options,               "options must be given");
  assert(options.contentType,   "contentType must be given");
  assert(options.expires,       "expires must be given");
  var that = this;
  return new Promise(function(accept, reject) {
    that.s3.getSignedUrl('putObject', {
      Key:          prefix,
      ContentType:  options.contentType,
      Expires:      options.expires
    }, function(err, url) {
      if (err) {
        return reject(err);
      }
      return accept(url);
    });
  });
};

/**
 * Create an unsigned GET URL
 */
Bucket.prototype.createGetUrl = function(prefix) {
  assert(prefix,                "prefix must be given");
  return `${this.s3.endpoint.href}${this.bucket}/${prefix}`;
};

/**
 * Create a signed GET URL
 *
 * options:
 * {
 *   expires:        // Seconds to URL expiry
 * }
 */
Bucket.prototype.createSignedGetUrl = function(prefix, options) {
  assert(prefix,                "prefix must be given");
  assert(options,               "options must be given");
  assert(options.expires,       "expires must be given");
  var that = this;
  return new Promise(function(accept, reject) {
    that.s3.getSignedUrl('getObject', {
      Key:          prefix,
      Expires:      options.expires
    }, function(err, url) {
      if (err) {
        return reject(err);
      }
      return accept(url);
    });
  });
};

/** Delete a object */
Bucket.prototype.deleteObject = function(prefix) {
  assert(prefix, "prefix must be provided");
  return this.s3.deleteObject({
    Key:  prefix
  }).promise();
};

/** Delete a list of objects */
Bucket.prototype.deleteObjects = function(prefixes) {
  assert(prefixes instanceof Array, "prefixes must be an array");
  return this.s3.deleteObjects({
    Delete: {
      Objects: prefixes.map(function(prefix) {
        return {
          Key:  prefix
        };
      })
    }
  }).promise();
};

/** Setup CORS policy, so it can opened from a browser, when authenticated */
Bucket.prototype.setupCORS = async function() {
  var rules = [
    {
      AllowedOrigins: ['*'],
      AllowedMethods: ['GET', 'PUT', 'HEAD', 'POST', 'DELETE'],
      AllowedHeaders: ['*'],
      MaxAgeSeconds:  60 * 60,
      ExposeHeaders:  []
    }
  ];
  try {
    // Fetch CORS to see if they as expected already
    var req = await this.s3.getBucketCors().promise();
    if (_.isEqual(req.data.CORSRules, rules)) {
      debug("CORS already set for bucket: %s", this.bucket);
      return;
    }
  }
  catch (err) {
    // Failed to fetch CORS, ignoring issue for now
    debug("[alert-operator] Failed to fetch CORS, err: %s, JSON: %j",
          err, err, err.stack);
  }

  // Set CURS
  return this.s3.putBucketCors({
    CORSConfiguration: {
      CORSRules: rules
    }
  }).promise();
};
