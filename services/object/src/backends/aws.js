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
    this.region = await getBucketRegion({ bucket: this.config.bucket, credentials });
    this.s3 = new aws.S3({ region: this.region, ...credentials });
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

  async downloadObject(object, method, params) {
    switch (method){
      case 'simple': {
        let url;
        if (this.config.signGetUrls) {
          url = await this.s3.getSignedUrlPromise('getObject', {
            Bucket: this.config.bucket,
            Key: object.name,
            // 30 seconds is copied from the queue; the idea is that the download
            // begins almost immediately.  It might also make sense to use the
            // expiration time of the object here.
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
    // leaking storage.  Note that s3.deleteObject is idempotent: this will not fail if the
    // object does not exist.
    await this.s3.deleteObject({
      Bucket: this.config.bucket,
      Key: object.name,
    }).promise();

    return true;
  }
}

const getBucketRegion = async ({ bucket, ...credentials }) => {
  const s3 = new aws.S3(credentials);
  const { LocationConstraint } = await s3.getBucketLocation({
    Bucket: bucket,
  }).promise();

  return LocationConstraint;
};

module.exports = { getBucketRegion, AwsBackend };
