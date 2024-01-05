import {
  DeleteObjectCommand,
  DeleteObjectsCommand,
  GetBucketCorsCommand,
  GetObjectCommand,
  PutBucketCorsCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { getEndpointFromInstructions } from '@aws-sdk/middleware-endpoint';
import _ from 'lodash';
import path from 'path';
import debugFactory from 'debug';
const debug = debugFactory('app:bucket');
import assert from 'assert';

/**
 * Create S3 bucket wrapper.
 *
 * options:
 * {
 *   bucket:             // S3 bucket to use
 *   awsOptions: {
 *     accessKeyId:      // ...
 *     secretAccessKey:  // ...
 *     ..any other AWS option; see https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/client/s3/
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
    this.s3 = new S3Client({
      credentials: {
        accessKeyId: options.awsOptions.accessKeyId,
        secretAccessKey: options.awsOptions.secretAccessKey,
      },
      region: options.awsOptions.region || 'us-east-1',
      followRegionRedirects: true,
      ...options.awsOptions,
      forcePathStyle: !!options.awsOptions.s3ForcePathStyle,
    });
  } else {
    this.s3 = options.awsOptions.mock;
  }
  // Store bucket CDN & CORS options
  this.bucketCDN = options.bucketCDN;
  this.skipCorsConfiguration = options.awsOptions.skipCorsConfiguration;
};

// Export Bucket
export default Bucket;

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

  const command = new PutObjectCommand({
    Bucket: this.bucket,
    Key: prefix,
    ContentType: options.contentType,
  });
  return getSignedUrl(this.s3, command, {
    expiresIn: options.expires,
  });
};

/**
 * Create an unsigned GET URL
 */
Bucket.prototype.createGetUrl = async function(prefix, forceS3 = false) {
  assert(prefix, 'prefix must be given');
  if (this.bucketCDN && !forceS3) {
    return `${this.bucketCDN}/${prefix}`;
  }
  const command = new GetObjectCommand({
    Bucket: this.bucket,
    Key: prefix,
  });
  const { url } = await getEndpointFromInstructions(command.input, GetObjectCommand, this.s3.config);
  url.pathname = path.join(url.pathname, prefix);
  return url.href;
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

  const command = new GetObjectCommand({
    Bucket: this.bucket,
    Key: prefix,
  });
  return getSignedUrl(this.s3, command, {
    expiresIn: options.expires,
  });
};

/** Delete a object */
Bucket.prototype.deleteObject = function(prefix) {
  assert(prefix, 'prefix must be provided');
  return this.s3.send(new DeleteObjectCommand({
    Bucket: this.bucket,
    Key: prefix,
  }));
};

/** Delete a list of objects */
Bucket.prototype.deleteObjects = function(prefixes, quiet = false) {
  assert(prefixes instanceof Array, 'prefixes must be an array');
  // S3 API limit: https://docs.aws.amazon.com/AmazonS3/latest/API/API_DeleteObjects.html
  assert(prefixes.length <= 1000, 'not more than 1000 prefixes can be deleted');
  return this.s3.send(new DeleteObjectsCommand({
    Bucket: this.bucket,
    Delete: {
      Objects: prefixes.map(function(prefix) {
        return {
          Key: prefix,
        };
      }),
      ...(quiet ? { Quiet: true } : {} ),
    },
  }));
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
    let req = await this.s3.send(new GetBucketCorsCommand({
      Bucket: this.bucket,
    }));
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
  return this.s3.send(new PutBucketCorsCommand({
    Bucket: this.bucket,
    CORSConfiguration: {
      CORSRules: rules,
    },
  }));
};
