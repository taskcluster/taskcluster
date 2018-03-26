const assert = require('assert');
const {documenter, downloader} = require('../');
const debug = require('debug')('test');
const _ = require('lodash');
const tar = require('tar-stream');
const rootdir = require('app-root-dir');
const zlib = require('zlib');
const path = require('path');
const validator = require('taskcluster-lib-validate');
const config = require('typed-env-config');
const API = require('taskcluster-lib-api');
const Exchanges = require('pulse-publisher');
const mockS3UploadStream = require('./mockS3UploadStream');
const awsMock = require('mock-aws-s3');

async function getObjectsInStream(inStream) {
  let output = {};
  let extractor = tar.extract();

  let downloadPromise = new Promise((resolve, reject) => {
    extractor.on('entry', (header, stream, callback) => {
      let data = [];

      stream.on('data', function(chunk) {
        data.push(chunk);
      });

      stream.on('end', () => {
        output[header.name] = data.join('');
        callback(); //ready for next entry
      });

      stream.resume(); //just auto drain the stream
    });

    extractor.on('finish', function() {
      // all entries read
      resolve();
    });

    extractor.on('error', function() {
      reject();
    });
  });
  inStream.pipe(extractor);
  await downloadPromise;
  return output;
}

function assertInTarball(shoulds, tarball) {
  shoulds.push('metadata.json');
  shoulds.push('README.md');
  let contains = [];
  let extractor = tar.extract();
  extractor.on('entry', (header, stream, callback) => {
    stream.on('end', () => {
      contains.push(header.name);
      callback(); // ready for next entry
    });
    stream.resume(); // just auto drain the stream
  });

  return new Promise((resolve, reject) => {
    extractor.on('finish', function() {
      try {
        assert.deepEqual(contains.sort(), shoulds.sort());
      } catch (e) {
        reject(e);
      }
      resolve();
    });

    tarball.pipe(zlib.Unzip()).pipe(extractor);
  });
}

suite('documenter', () => {
  let validate = null;
  let api = null;
  let exchanges = null;
  let references = null;
  let cfg = config({});
  let credentials = cfg.taskcluster.credentials;
  let tier = 'core';

  suiteSetup(async () => {
    validate = await validator({
      folder: './test/schemas',
      baseUrl: 'http://localhost:1203/',
      constants: {'my-constant': 42},
    });
    api = new API({
      title: 'Testing Stuff',
      description: 'This is for testing stuff!',
    });
    exchanges = new Exchanges({
      title: 'Testing Stuff Again',
      description: 'Another test!',
    });
    references = [
      {name: 'api', reference: api.reference({baseUrl: 'http://localhost'})},
      {name: 'events', reference: exchanges.reference({baseUrl: 'http://localhost'})},
    ];
  });

  test('tarball exists', async function() {
    let doc = await documenter({
      schemas: validate.schemas,
      tier,
    });
    assert.ok(doc.tgz);
  });

  test('tarball is empty but exists', function() {
    let doc = documenter({
      tier,
    });
    assert.equal(doc.tgz, null);
  });

  test('tarball contains docs and metadata', async function() {
    let doc = await documenter({
      docsFolder: './test/docs',
      tier,
    });
    let shoulds = [
      'docs/example.md',
      'docs/nested/nested-example.md',
    ];
    return assertInTarball(shoulds, doc.tgz);
  });

  test('tarball contains schemas and metadata', async function() {
    let doc = await documenter({
      schemas: validate.schemas,
      tier,
    });
    let shoulds = [
      'schemas/foo.json',
      'schemas/bar.json',
      'docs/documenting-non-services.md',
      'docs/format.md',
    ];
    return assertInTarball(shoulds, doc.tgz);
  });

  test('tarball contains references and metadata', async function() {
    let doc = await documenter({
      references,
      tier,
    });
    let shoulds = [
      'references/api.json',
      'references/events.json',
      'docs/documenting-non-services.md',
      'docs/format.md',
    ];
    return assertInTarball(shoulds, doc.tgz);
  });

  test('tarball contains only metadata', async function() {
    let doc = await documenter({
      tier,
    });
    let shoulds = [
      'docs/documenting-non-services.md',
      'docs/format.md',
    ];
    return assertInTarball(shoulds, doc.tgz);
  });

  const publishTest = async function(mock) {
    const options = {
      project: 'docs-testing',
      schemas: validate.schemas,
      tier,
      docsFolder: './test/docs/',
      references,
      bucket: cfg.bucket,
      publish: true,
    };
    if (mock) {
      options.aws = {accessKeyId: 'fake', secretAccessKey: 'fake'};
      options.S3UploadStream = mockS3UploadStream;
    } else {
      if (!credentials.clientId) {
        this.skip();
      }
      options.credentials = credentials;
    }

    const doc = await documenter(options);
    assert.ok(doc.tgz);
  };

  test('test publish tarball (real)', function() {
    return publishTest.call(this, false);
  });
  test('test publish tarball (mock)', function() {
    return publishTest.call(this, true);
  });
});

suite('downloader', function() {
  let cfg = config({});
  let credentials = cfg.taskcluster.credentials;

  const downloadTest = async function(mock) {
    let _s3 = null;

    if (mock) {
      // See https://bugzilla.mozilla.org/show_bug.cgi?id=1443019
      credentials = {clientId: 'fake', accessToken: 'fake'};

      awsMock.config.basePath = path.join(__dirname, '..', 'test', 'bucket');
      _s3 = awsMock.S3(credentials);

    } else if (!credentials.clientId) {
      this.skip();
    }

    let stream = await downloader({
      project: 'docs-testing',
      bucket: cfg.bucket,
      credentials,
      _s3,
    });

    let files = await getObjectsInStream(stream);

    let shoulds = [
      'metadata.json',
    ];

    for (let should of shoulds) {
      assert.ok(files[should]);
    }
  };

  test('download tarball contains project (real)', function() {
    return downloadTest.call(this, false);
  });

  test('download tarball contains project (mock)', function() {
    return downloadTest.call(this, true);
  });
});
