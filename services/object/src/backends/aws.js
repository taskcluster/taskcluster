const { Backend } = require('./base');
const assert = require('assert');
const aws = require('aws-sdk');
const { reportError } = require('taskcluster-lib-api');
const taskcluster = require('taskcluster-client');
const qs = require('qs');
const { parse: parseContentType } = require('content-type');

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

    // determine whether we are talking to a genuine AWS S3, or an emulation of it
    this.isAws = !this.config.endpoint;

    if (this.isAws) {
      this.tags = this.config.tags || {};
      if (Object.entries(this.tags).some(([k, v]) => typeof v !== 'string')) {
        throw new Error(`backend ${this.backendId} has invalid 'tags' configuration`);
      }
    } else if (this.config.tags) {
      throw new Error('tags are only supported on the real AWS S3');
    }
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

    const contentDisposition = this.contentDisposition(contentType);

    await this.s3.putObject({
      Bucket: this.config.bucket,
      Key: object.name,
      ContentType: contentType,
      // note that GCS's S3 emulation does not support this; see
      // https://github.com/taskcluster/taskcluster/issues/4748
      ...(this.isAws && contentDisposition ? { ContentDisposition: contentDisposition } : {}),
      Body: bytes,
      Tagging: this.objectTaggingHeader(object),
    }).promise();

    return { dataInline: true };
  }

  async createPutUrlUpload(object, { contentType, contentLength }) {
    const expires = taskcluster.fromNow(`${PUT_URL_EXPIRES_SECONDS} s`);
    const url = await this.s3.getSignedUrlPromise('putObject', {
      Bucket: this.config.bucket,
      Key: object.name,
      ContentType: contentType,
      ...(this.isAws ? { Tagging: this.objectTaggingHeader(object) } : {}),
      // NOTE: AWS does not allow us to enforce Content-Length, so that is ignored here
      Expires: PUT_URL_EXPIRES_SECONDS + 10, // 10s for clock skew
    });

    const headers = {
      'Content-Type': contentType,
      'Content-Length': contentLength.toString(),
      'Content-Encoding': 'identity',
    };

    // we want to force HTML files to have an "attachment" disposition, so that
    // browsers do not render them as "regular" web pages, which would open up
    // all sorts of browser-based vulnerabilities.  note that GCS's S3
    // emulation does not support this; see
    // https://github.com/taskcluster/taskcluster/issues/4748
    const contentDisposition = this.contentDisposition(contentType);
    if (this.isAws && contentDisposition) {
      headers['Content-Disposition'] = contentDisposition;
    }

    // tags are not supported on GCS, so only add this header on AWS
    if (this.isAws) {
      headers['x-amz-tagging'] = this.objectTaggingHeader(object);
    }

    return {
      putUrl: {
        url,
        expires: expires.toJSON(),
        headers,
      },
    };
  }

  async finishUpload(object) {
    if (this.isAws) {
      // NOTE: AWS does not enforce that the `x-amx-tagging` header is present in
      // the PUT request merely because `Tagging` is included in the signed PUT
      // URL (!!), so we also add the tag after-the-fact here, in case a poorly
      // behaved uploader fails to include the header.  This has the side-effect
      // of verifying that the object is present on S3 when finished.
      await this.s3.putObjectTagging({
        Bucket: this.config.bucket,
        Key: object.name,
        Tagging: this.objectTaggingArg(object),
      }).promise();
    }
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

  /**
   * Get the content disposition header for this object, if any
   */
  contentDisposition(contentType) {
    if (parseContentType(contentType).type === 'text/html') {
      return 'attachment';
    }
  }

  /**
   * Get the tags for this object in JSON object format {k: v}.
   */
  _objectTags(object) {
    return {
      ...this.tags,
      ProjectId: object.project_id,
    };
  }

  /**
   * Construct the "Tagging" argument containing the tags for this object, as included
   * in the `x-amx-tagging` header.
   */
  objectTaggingHeader(object) {
    return qs.stringify(this._objectTags(object));
  }

  /**
   * Construct the "TagSet" argument containing the tags for this object, as passed to
   * s3.setObjectTagging.
   */
  objectTaggingArg(object) {
    return {
      TagSet: Object.entries(this._objectTags(object)).map(([Key, Value]) => ({ Key, Value })),
    };
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

  // us-east-1 is represented by an empty LocationConstraint,
  // because it was invented before there were regions (c.f.
  // https://en.wikipedia.org/wiki/Pangaea)
  return LocationConstraint === '' ? 'us-east-1' : LocationConstraint;
};

module.exports = { getBucketRegion, AwsBackend };
