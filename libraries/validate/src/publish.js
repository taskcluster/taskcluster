const _ = require('lodash');
const assert = require('assert');
const debug = require('debug')('taskcluster-lib-validate');
const Promise = require('promise');
const fs = require('fs');
const path = require('path');
const mkdirp = require('mkdirp');
const aws = require('aws-sdk');

/**
* Publish the given schemas to S3, as described by cfg (bucket, etc.)
*
* This is only used in the "old" taskcluster.net deployment.
* This also implements the debugging output (writeFile, preview).
*/
const publish = async ({cfg, schemaset, rootUrl}) => {
  if (cfg.publish) {
    debug('Publishing schemas');
    assert(cfg.aws, 'Can\'t publish without aws credentials.');
    let s3Provider = cfg.s3Provider;
    if (!s3Provider) {
      debug('Using default s3 client');
      s3Provider = new aws.S3(cfg.aws);
    }
    await Promise.all(_.map(schemaset.absoluteSchemas(rootUrl), (content, name) => {
      return s3(
        s3Provider,
        cfg.bucket,
        `${cfg.serviceName}/`,
        name,
        content
      );
    }));
  }

  if (cfg.writeFile) {
    debug('Writing schema to local file');
    const dir = 'rendered_schemas';
    _.forEach(schemaset.abstractSchemas(), (content, name) => {
      const file = path.join(dir, name);
      const subdir = path.dirname(file);
      mkdirp.sync(subdir);
      writeFile(file, content);
    });
  }

  if (cfg.preview) {
    debug('Writing schema to console');
    await Promise.all(_.map(schemaset.abstractSchemas(), (content, name) => {
      return preview(
        name,
        content
      );
    }));
  }
};

function s3(s3, bucket, prefix, name, content) {
  return new Promise((accept, reject) => {
    debug('Publishing schema %s', name);
    s3.putObject({
      Bucket: bucket,
      Key: prefix + name,
      Body: JSON.stringify(content, null, 2),
      ContentType: 'application/json',
    }, (err, data) => {
      if (err) {
        debug('Publishing failed for schema %s', name);
        return reject(err);
      }
      debug('Publishing succeeded for schema %s', name);
      return accept(data);
    });
  });
}

/**
 * Write the schema to a local file.  This is useful for debugging purposes
 * mainly.
 */
function writeFile(filename, content) {
  fs.writeFileSync(filename, JSON.stringify(content, null, 2));
}

/**
 * Write the generated schema to the console as pretty-json output.  This is
 * useful for debugging purposes
 */
function preview(name, content) {
  console.log('=======');
  console.log('JSON SCHEMA PREVIEW BEGIN: ' + name);
  console.log('=======');
  console.log(JSON.stringify(content, null, 2));
  console.log('=======');
  console.log('JSON SCHEMA PREVIEW END: ' + name);
  return Promise.resolve();
}

module.exports = publish;
