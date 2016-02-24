let debug = require('debug')('taskcluster-lib-validate')
let _ = require('lodash');
let assert = require('assert');
let Ajv = require('ajv');
let AWS = require('aws-sdk');

async function validator(options) {

  let cfg = _.defaults(options, {
    constants: './schemas/contants.yml',
    folder: './schemas',
    publish: process.env.NODE_ENV == 'production',
    baseUrl: 'http://schema.taskcluster.net/',
  });

  if (cfg.publish) {
    debug('Choosing to publish');
    assert(cfg.aws, "Can't publish without aws credentials.");
    assert(cfg.prefix, "Can't publish without prefix");
    assert(cfg.prefix == "" || /.+\/$/.test(cfg.prefix),
      "prefix must be empty or should end with a slash");
    let s3Provider = null;
    if (cfg.s3Provider) {
      debug('Using user-provided s3 client');
      s3Provider = cfg.s3Provider;
    }
    else {
      debug('Using default s3 client');
      s3Provider = new AWS.S3(cfg.aws);
    }
  }
};

module.exports = validator;
