const { Backend } = require('./base');
const assert = require('assert');
const aws = require('aws-sdk');
const { reportError } = require('taskcluster-lib-api');
const taskcluster = require('taskcluster-client');

const PUT_URL_EXPIRES_SECONDS = 45 * 60;

class AwsBackend extends Backend {
  constructor(options) {
    super(options);

    for (let prop of ['accessKeyId', 'secretAccessKey', 'bucket', 'signGetUrls']) {
      assert(prop in options.config, `backend ${options.backendId} is missing ${prop}`);
    }

    this.config = options.config;
  }

  async setup() {
    const credentials = {
      accessKeyId: this.config.accessKeyId,
      secretAccessKey: this.config.secretAccessKey,
    };
    // only include endpoint if included, since included for gcp backend but not needed for aws backend
    let options = { ...credentials };
    if ('endpoint' in this.config) {
      options.endpoint = new aws.Endpoint(this.config.endpoint);
    } else {
      this.region = await getBucketRegion({ bucket: this.config.bucket, endpoint: this.config.endpoint, credentials });
      options.region = this.region;
    }
    this.s3 = new aws.S3(options);
  }

  async createUpload(object, proposedUploadMethods) {
    // select upload methods in order of our preference
    if ('dataInline' in proposedUploadMethods) {
      return await this.createDataInlineUpload(object, proposedUploadMethods.dataInline);
    }

    if ('putUrl' in proposedUploadMethods) {
      return await this.createPutUrlUpload(object, proposedUploadMethods.putUrl);
    }

    return {};
  }

  async createDataInlineUpload(object, { contentType, objectData }) {
    let bytes;
    try {
      bytes = Buffer.from(objectData, 'base64');
    } catch (err) {
      return reportError('InputError', 'Invalid base64 objectData', {});
    }

    await this.s3.putObject({
      Bucket: this.config.bucket,
      Key: object.name,
      ContentType: contentType,
      Body: bytes,
    }).promise();

    return { dataInline: true };
  }

  async createPutUrlUpload(object, { contentType, contentLength }) {
    const expires = taskcluster.fromNow(`${PUT_URL_EXPIRES_SECONDS} s`);
    const url = await this.s3.getSignedUrlPromise('putObject', {
      Bucket: this.config.bucket,
      Key: object.name,
      ContentType: contentType,
      // NOTE: AWS does not allow us to enforce Content-Length, so that is ignored here
      Expires: PUT_URL_EXPIRES_SECONDS + 10, // 10s for clock skew
    });

    return {
      putUrl: {
        url,
        expires: expires.toJSON(),
        headers: {
          'Content-Type': contentType,
          'Content-Length': contentLength.toString(),
        },
      },
    };
  }

  async availableDownloadMethods(object) {
    return ['simple'];
  }

  async startDownload(object, method, params) {
    switch (method){
      case 'simple': {
        let url;
        if (this.config.signGetUrls) {
          url = await this.s3.getSignedUrlPromise('getObject', {
            Bucket: this.config.bucket,
            Key: object.name,
            // 30 minutes is copied from the queue; the idea is that the download
            // begins almost immediately.  It might also make sense to use the
            // expiration time of the object here.
            // https://github.com/taskcluster/taskcluster/issues/3946
            Expires: 30 * 60,
          });
        } else {
          url = `${this.s3.endpoint.href}${this.config.bucket}/${encodeURIComponent(object.name)}`;
        }
        return { method, url };
      }

      default: {
        throw new Error(`unknown download method ${method}`);
      }
    }
  }

  async expireObject(object) {
    // When an object is being expired, we first delete the object from S3.  Even if lifecycle
    // or other S3 policies would accomplish the same thing, this serves as a backstop to
    // prevent removing the database record while the object itself is still on S3, thereby
    // leaking storage.  Note that s3.deleteObject is idempotent in AWS, but not in Google,
    // and since we don't care about objects that couldn't be deleted, we swallow NoSuchKey errors.
    try {
      await this.s3.deleteObject({
        Bucket: this.config.bucket,
        Key: object.name,
      }).promise();
    } catch (error) {
      // Ignore NoSuchKey errors
      if (error.code !== "NoSuchKey") {
        throw error;
      }
    }
    return true;
  }
}

const getBucketRegion = async ({ bucket, endpoint, ...credentials }) => {
  let options = credentials;
  if (endpoint) {
    options.endpoint = new aws.Endpoint(endpoint);
  }
  const s3 = new aws.S3(options);
  const { LocationConstraint } = await s3.getBucketLocation({
    Bucket: bucket,
  }).promise();

  return LocationConstraint;
};

module.exports = { getBucketRegion, AwsBackend };
