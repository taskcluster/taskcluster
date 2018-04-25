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
let util = require('util');
let mkdirp = util.promisify(require('mkdirp'));

async function documenter(options) {
  options = _.defaults({}, options, {
    referenceUrl: 'https://docs.taskcluster.net/reference/',
    aws: null,
    credentials: undefined,
    project: null,
    tier: null,
    schemas: {},
    menuIndex: 10,
    readme: path.join(rootdir.get(), 'README.md'),
    docsFolder: path.join(rootdir.get(), '/docs'),
    bucket: 'taskcluster-raw-docs',
    references: [],
    publish: process.env.NODE_ENV == 'production',
  });
  
  const rv = new Documenter(options);
  if (options.publish) {
    await rv.publish();
  }
  return rv;
}

module.exports = documenter;

const TIERS = [
  'core',
  'platform',
  'integrations',
  'operations',
  'libraries',
  'workers',
];

class Documenter {
  constructor(options) {
    assert(options.schemas, 'options.schemas must be given');
    assert(options.tier, 'options.tier must be given');
    assert(TIERS.indexOf(options.tier) !== -1,
      `options.tier must be one of ${TIERS.join(', ')}`
    );

    if (!options.project) {
      let pack = require(path.join(rootdir.get(), 'package.json'));
      options.project = pack.name;
    }
    this.options = options;
  }

  /**
   * Get the URL for documentation for this service; used in error messages.
   */
  get documentationUrl() {
    return this.options.referenceUrl + this.options.tier + '/' + this.options.project;
  }

  /**
   * Generate a stream containing a tarball with all of the associated metadata.
   * This is mostly to support the "old way", and when nothing uses the old way
   * anymore this can be adapted to write data directly to DOCS_OUTPUT_DIR.
   *
   * Note that this is a zlib-compressed tarball.
   */
  async _tarballStream() {
    function headers(name, dir) {
      return {name: path.join(dir || '', name)};
    }

    let tarball = tar.pack();

    let metadata = {
      version: 1,
      project: this.options.project,
      tier: this.options.tier,
      menuIndex: this.options.menuIndex,
    };

    tarball.entry(
      headers('metadata.json'),
      JSON.stringify(metadata, null, 2)
    );

    _.forEach(this.options.schemas, (schema, name) => tarball.entry(
      headers(name, 'schemas'),
      schema
    ));

    _.forEach(this.options.references, reference => tarball.entry(
      headers(reference.name + '.json', 'references'),
      JSON.stringify(reference.reference, null, 2)
    ));

    try {
      tarball.entry(
        headers('README.md'),
        await fs.readFile(this.options.readme)
      );
    } catch (err) {
      if (err.code !== 'ENOENT') {
        throw err;
      }
      debug('README.md does not exist. Continuing.');
    }

    try {
      await Promise.all(recursiveReadSync(this.options.docsFolder).map(async file => {
        let relativePath = path.relative(this.options.docsFolder, file);
        tarball.entry(headers(relativePath, 'docs'), await fs.readFile(file, {encoding: 'utf8'}));
      }));
    } catch (err) {
      if (err.code !== 'ENOENT') {
        throw err;
      }
      debug('Docs folder does not exist. Continuing.');
    }

    tarball.finalize();
    return tarball.pipe(zlib.createGzip());
  }

  /**
   * Write the tarball to a directory (the new way)
   */
  async write({docsDir}) {
    if (!docsDir) {
      throw new Error('docsDir is not set');
    } else if (fs.existsSync(docsDir)) {
      throw new Error(`docsDir ${docsDir} already exists`);
    }

    // For the moment, this untar's the tarball created elsewhere in this file;
    // when the "old way' is no longer used, this should be refactored to just
    // write the files to the directory directly.
    const extract = tar.extract();

    await new Promise((resolve, reject) => {
      extract.on('entry', (header, stream, next) => {
        // NOTE: we ignore permissions, ownership, etc..
        const pathname = path.join(docsDir, header.name);
        mkdirp(path.dirname(pathname)).then(() => {
          stream.once('end', next);
          stream.once('error', reject);
          stream.pipe(fs.createWriteStream(pathname));
        }).catch(reject);
      });

      extract.on('finish', resolve);
      extract.on('error', reject);

      this._tarballStream()
        .then(tbStream => tbStream.pipe(zlib.Unzip()).pipe(extract))
        .catch(reject);
    });
  }

  /**
   * Publish the tarball to S3 (the old way).
   *
   * This is called automatically if options.publish is true.
   */
  async publish() {
    let gz = await this._tarballStream();

    let creds = this.options.aws;
    if (!creds) {
      let auth = new client.Auth({
        credentials: this.options.credentials,
        baseUrl: this.options.authBaseUrl,
      });

      creds = await auth.awsS3Credentials('read-write', this.options.bucket, this.options.project + '/');
    }

    let s3 = new aws.S3(creds.credentials);
    let s3Stream = new (this.options.S3UploadStream || S3UploadStream)(s3);

    let upload = s3Stream.upload({
      Bucket: this.options.bucket,
      Key: this.options.project + '/latest.tar.gz',
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
    gz.pipe(upload);
    await uploadPromise;
  }
}
