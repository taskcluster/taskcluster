const { Backend } = require('./base');
const assert = require('assert');
const aws = require('aws-sdk');

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

  async temporaryUpload(object, data) {
    await this.s3.putObject({
      Bucket: this.config.bucket,
      Key: object.name,
      Body: data,
    }).promise();
  }

  async availableDownloadMethods(object) {
    return ['simple'];
  }

  async fetchObjectMetadata(object, method, params) {
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
          url = `${this.s3.endpoint.href}${this.config.bucket}/${encodeURI(object.name)}`;
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
    // and since we don't care about objects that couldn't be deleted, we swallow any errors.
    try {
      await this.s3.deleteObject({
        Bucket: this.config.bucket,
        Key: object.name,
      }).promise();
    } catch (error) {
      // This can happen if object expired between the time the object metadata was retrieved
      // and the delete was executed, or if there was a network blip that caused a retry to
      // occur.  In no case do we really care if an object couldn't be deleted, as this
      // expiration process is only a backstop to e.g. a bucket level expiration policy.
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
