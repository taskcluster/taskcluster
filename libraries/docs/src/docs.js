let tar = require('tar-stream');
let _ = require('lodash');
let assert = require('assert');
let fs = require('mz/fs');
let path = require('path');
let recursiveReadSync = require('recursive-readdir-sync');
let zlib = require('zlib');
let rootdir = require('app-root-dir');
let aws = require('aws-sdk');
let client = require('taskcluster-client');
let S3UploadStream = require('s3-upload-stream');
let debug = require('debug')('taskcluster-lib-docs');

async function documenter(options) {
  options = _.defaults({}, options, {
    credentials: {},
    project: null,
    tier: null,
    schemas: {},
    menuIndex: 10,
    docsFolder: rootdir.get() + '/docs',
    references: [],
    publish: process.env.NODE_ENV == 'production',
  });

  assert(options.schemas, 'options.schemas must be given');
  assert(options.tier, 'options.tier must be given');
  assert(['core', 'platform'].indexOf(options.tier) !== -1, 'options.tier is either core or platform');

  let tarball = tar.pack();
  let metadata = {version: 1, tier: options.tier, menuIndex: options.menuIndex};
  let data = JSON.stringify(metadata, null, 2);
  tarball.entry({name: 'metadata.json'}, data);

  let schemas = options.schemas;
  _.forEach(schemas, (name, schema) => {
    let data = JSON.stringify(schema, null, 2);
    tarball.entry({name: 'schema/' + name}, data);
  });

  let references = options.references;
  references.forEach(reference => {
    let data = JSON.stringify(reference, null, 2);
    tarball.entry({name: 'references/' + reference.name + '.json'}, data);
  });

  if (options.docsFolder) {
    try {
      let docs = options.docsFolder;
      let files = recursiveReadSync(options.docsFolder);
      await Promise.all(files.map(async (file) => {
        let relativePath = path.basename(file);
        let data = await fs.readFile(file, {encoding: 'utf8'});
        tarball.entry({name: 'docs/' + relativePath}, data);
      }));
    } catch (err) {
      if (err.code == 'ENOENT') {
        console.log('Docs folder does not exist');
      } else {
        throw err;
      }
    }
  }

  // the stream was added
  // no more entries
  tarball.finalize();

  let gzip = zlib.createGzip();
  let tgz = tarball.pipe(gzip);

  if (options.publish) {
    let auth = new client.Auth({
      credentials: options.credentials,
    });

    if (!options.project) {
      let pack = require(rootdir.get() + '/package.json');
      options.project = pack.name;
    }

    let creds = await auth.awsS3Credentials('read-write', 'taskcluster-raw-docs', options.project + '/');

    let s3 = new aws.S3(creds.credentials);
    let s3Stream = S3UploadStream(s3);

    let upload = s3Stream.upload({
      Bucket: 'taskcluster-raw-docs',
      Key: options.project + '/latest.tar.gz',
    });

    // handle progress
    upload.on('part', function(details) {
      debug(details);
    });

    let uploadPromise = new Promise((resolve, reject) => {
      // handle upload completion
      upload.on('uploaded', function(details) {
        debug(details);
        resolve(details);
      });

      // handle errors
      upload.on('error', function(error) {
        console.log(error.stack);
        reject(error);
      });
    });

    // pipe the incoming filestream through compression and up to s3
    tgz.pipe(upload);
    await uploadPromise;
  }

  let output = {
    tgz,
  };

  return output;
}

module.exports = documenter;
