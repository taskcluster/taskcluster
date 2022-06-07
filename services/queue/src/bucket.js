let aws = require('aws-sdk');
let _ = require('lodash');
let debug = require('debug')('app:bucket');
let assert = require('assert');

/**
 * Create S3 bucket wrapper.
 *
 * options:
 * {
 *   bucket:             // S3 bucket to use
 *   awsOptions: {
 *     accessKeyId:      // ...
 *     secretAccessKey:  // ...
 *     ..any other AWS option; see https://docs.aws.amazon.com/AWSJavaScriptSDK/latest/AWS/S3.html#constructor-property
 *     // --or--
 *     mock: <obj>,     // use mock S3 object
 *   },
 *   bucketCDN:          // https://cdn-for-bucket.com
 *   monitor:            // base.monitor instance
 * }
 */
let Bucket = function(options) {
  assert(options, 'options must be given');
  assert(options.bucket, 'bucket must be specified');
  assert(options.awsOptions, 'awsOptions must be specified');
  assert(!options.bucketCDN || typeof options.bucketCDN === 'string',
    'Expected bucketCDN to be a hostname or empty string for none');
  assert(options.monitor, 'options.monitor is required');
  if (options.bucketCDN) {
    assert(/^https?:\/\//.test(options.bucketCDN), 'bucketCDN must be http(s)');
    assert(/[^\/]$/.test(options.bucketCDN),
      'bucketCDN shouldn\'t end with slash');
  }
  // Store the monitor
  this.monitor = options.monitor;
  // Ensure access to the bucket property
  this.bucket = options.bucket;
  // Create S3 client
  if (!options.awsOptions.mock) {
    this.s3 = new aws.S3(_.defaults({
      params: {
        Bucket: options.bucket,
      },
    }, options.awsOptions));
  } else {
    this.s3 = options.awsOptions.mock;
  }
  // Store bucket CDN & CORS options
  this.bucketCDN = options.bucketCDN;
  this.skipCorsConfiguration = options.awsOptions.skipCorsConfiguration;
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
  assert(prefix, 'prefix must be given');
  assert(options, 'options must be given');
  assert(options.contentType, 'contentType must be given');
  assert(options.expires, 'expires must be given');

  // This is an explicitly created promise due to
  // https://github.com/aws/aws-sdk-js/issues/1008
  return new Promise((accept, reject) => {
    this.s3.getSignedUrl('putObject', {
      Key: prefix,
      ContentType: options.contentType,
      Expires: options.expires,
    }, (err, url) => {
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
Bucket.prototype.createGetUrl = function(prefix, forceS3 = false) {
  assert(prefix, 'prefix must be given');
  if (this.bucketCDN && !forceS3) {
    return `${this.bucketCDN}/${prefix}`;
  }
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
  assert(prefix, 'prefix must be given');
  assert(options, 'options must be given');
  assert(options.expires, 'expires must be given');

  // This is an explicitly created promise due to
  // https://github.com/aws/aws-sdk-js/issues/1008
  return new Promise((accept, reject) => {
    this.s3.getSignedUrl('getObject', {
      Key: prefix,
      Expires: options.expires,
    }, (err, url) => {
      if (err) {
        return reject(err);
      }
      return accept(url);
    });
  });
};

/** Delete a object */
Bucket.prototype.deleteObject = function(prefix) {
  assert(prefix, 'prefix must be provided');
  return this.s3.deleteObject({
    Key: prefix,
  }).promise();
};

/** Delete a list of objects */
Bucket.prototype.deleteObjects = function(prefixes) {
  assert(prefixes instanceof Array, 'prefixes must be an array');
  return this.s3.deleteObjects({
    Delete: {
      Objects: prefixes.map(function(prefix) {
        return {
          Key: prefix,
        };
      }),
    },
  }).promise();
};

/** Setup CORS policy, so it can opened from a browser, when authenticated */
Bucket.prototype.setupCORSIfNecessary = async function() {
  let rules = [
    {
      AllowedOrigins: ['*'],
      AllowedMethods: ['GET', 'PUT', 'HEAD', 'POST', 'DELETE'],
      AllowedHeaders: ['*'],
      MaxAgeSeconds: 60 * 60,
      ExposeHeaders: [],
    },
  ];

  if (this.skipCorsConfiguration) {
    debug('Skipping CORS configuration for bucket: %s', this.bucket);
    return;
  }
  try {
    // Fetch CORS to see if they as expected already
    let req = await this.s3.getBucketCors().promise();
    if (_.isEqual(req.CORSRules, rules)) {
      debug('CORS already set for bucket: %s', this.bucket);
      return;
    }
  } catch (err) {
    // Failed to fetch CORS, ignoring issue for now
    err.note = 'Failed to fetch CORS in bucket.js';
    this.monitor.reportError(err, 'warning');
  }

  // Set CORS
  return this.s3.putBucketCors({
    CORSConfiguration: {
      CORSRules: rules,
    },
  }).promise();
};
