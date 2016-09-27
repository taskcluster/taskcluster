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
    docsFolder: path.join(rootdir.get(), '/docs'),
    bucket: 'taskcluster-raw-docs',
    references: [],
    publish: process.env.NODE_ENV == 'production',
  });

  assert(options.schemas, 'options.schemas must be given');
  assert(options.tier, 'options.tier must be given');
  assert(['core', 'platform'].indexOf(options.tier) !== -1, 'options.tier is either core or platform');

  if (!options.project) {
    let pack = require(path.join(rootdir.get(), 'package.json'));
    options.project = pack.name;
  }

  function headers(name, dir) {
    return {name: path.join(options.project, dir || '', name)};
  }

  let tarball = tar.pack();

  let metadata = {
    version: 1,
    project: options.project,
    tier: options.tier,
    menuIndex: options.menuIndex,
  };

  tarball.entry(
    headers('metadata.json'),
    JSON.stringify(metadata, null, 2)
  );

  _.forEach(options.schemas, (schema, name) => tarball.entry(
    headers(name, 'schemas'),
    schema
  ));

  _.forEach(options.references, reference => tarball.entry(
    headers(reference.name + '.json', 'references'),
    JSON.stringify(reference.reference, null, 2)
  ));

  try {
    tarball.entry(
      headers('README.md'),
      await fs.readFile(path.join(rootdir.get(), 'README.md'))
    );
  } catch (err) {
    if (err.code !== 'ENOENT') {
      throw err;
    }
    debug('README.md does not exist. Continuing.');
  }

  try {
    await Promise.all(recursiveReadSync(options.docsFolder).map(async file => {
      let relativePath = path.relative(options.docsFolder, file);
      tarball.entry(headers(relativePath, 'docs'), await fs.readFile(file, {encoding: 'utf8'}));
    }));
  } catch (err) {
    if (err.code !== 'ENOENT') {
      throw err;
    }
    debug('Docs folder does not exist. Continuing.');
  }

  tarball.finalize();

  let tgz = tarball.pipe(zlib.createGzip());

  if (options.publish) {
    let auth = new client.Auth({
      credentials: options.credentials,
    });

    let creds = await auth.awsS3Credentials('read-write', options.bucket, options.project + '/');

    let s3 = new aws.S3(creds.credentials);
    let s3Stream = S3UploadStream(s3);

    let upload = s3Stream.upload({
      Bucket: options.bucket,
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

  return {
    tgz,
  };
}

async function downloader(options) {
  options = _.defaults({}, options, {
    credentials: {},
    bucket: 'taskcluster-raw-docs',
    project: null,
  });

  let auth = new client.Auth({
    credentials: options.credentials,
  });

  let creds = await auth.awsS3Credentials('read-only', options.bucket, options.project + '/');

  let s3 = new aws.S3(creds.credentials);

  let readStream = s3.getObject({
    Bucket: options.bucket,
    Key: options.project + '/latest.tar.gz',
  }).createReadStream();

  return readStream.pipe(zlib.Unzip());
}

module.exports = {documenter, downloader};
