const _ = require('lodash');
const client = require('taskcluster-client');
const aws = require('aws-sdk');
const zlib = require('zlib');

async function downloader(options) {
  options = _.defaults({}, options, {
    credentials: {},
    bucket: 'taskcluster-raw-docs',
    project: null,
  });

  let auth = new client.Auth({
    credentials: options.credentials,
  });

  let s3;
  if (options._s3) {
    s3 = options._s3;
  } else {
    let creds = await auth.awsS3Credentials('read-only', options.bucket, options.project + '/');
    s3 = new aws.S3(creds.credentials);
  }

  let readStream = s3.getObject({
    Bucket: options.bucket,
    Key: options.project + '/latest.tar.gz',
  }).createReadStream();

  return readStream.pipe(zlib.Unzip());
}

module.exports = downloader;
