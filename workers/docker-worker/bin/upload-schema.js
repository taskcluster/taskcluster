#!/usr/bin/env node --harmony
/**
The docker worker schema situation is not as easy as the queue or other http
services. The worker consumes mostly from a private state pulling from trusted
resources. That and the fact that we could have thousands of workers makes
auto pushing schema's tricky. For now this script does the uploads manually.
*/

var aws = require('aws-sdk-promise');

var loadConfig = require('taskcluster-base/config');
var config = loadConfig({
  defaults: require('../config/defaults'),
  profile: require('../config/production'),
  filename: 'docker-worker'
});

async function main () {
  var s3 = new aws.S3({
    region: config.get('schema:region'),
    params: {
      Bucket: config.get('schema:bucket')
    }
  });

  var key = config.get('schema:path') + 'payload.json';
  console.log('uploading: %s', key);
  return await s3.putObject({
    Key: key,
    ContentType: 'application/json',
    Body: new Buffer(JSON.stringify(require('../schemas/payload'), null, 2))
  }).promise();
}

main().then(() => {
    console.log(
      'Done uploading schemas to s3://%s%s',
      config.get('schema:bucket'), config.get('schema:path')
    );
  }, (err) => {
  if (err) {
    console.error(err);
    process.exit(1);
  }
});
