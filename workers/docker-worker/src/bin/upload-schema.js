#!/usr/bin/env node --harmony
/**
The docker worker schema situation is not as easy as the queue or other http
services. The worker consumes mostly from a private state pulling from trusted
resources. That and the fact that we could have thousands of workers makes
auto pushing schema's tricky. For now this script does the uploads manually.
*/

var aws = require('aws-sdk');
var fs = require('fs');

var base = require('taskcluster-base');
var config = base.config({
  files: [`${__dirname}/../config.yml`],
  profile: 'production',
  env: process.env
});

async function main () {
  var s3 = new aws.S3({
    region: config.schema.region,
    params: {
      Bucket: config.schema.bucket
    }
  });

  var key = config.schema.path + 'payload.json';
  console.log('uploading: %s', key);
  return await s3.putObject({
    Key: key,
    ContentType: 'application/json',
    Body: new Buffer(fs.readFileSync('../schemas/payload.json'))
  }).promise();
}

main().then(() => {
  console.log(
    'Done uploading schemas to https://%s/%spayload.json',
    config.schema.bucket, config.schema.path
  );
}, (err) => {
  if (err) {
    throw err;
  }
}).catch(err => {
  console.error('Error uploading schema');
  throw err;
});
