const assert = require('assert');
const {documenter} = require('../');
const fs = require('fs');
const tar = require('tar-stream');
const zlib = require('zlib');
const path = require('path');
const SchemaSet = require('taskcluster-lib-validate');
const config = require('taskcluster-lib-config');
const APIBuilder = require('taskcluster-lib-api');
const {Exchanges} = require('taskcluster-lib-pulse');
const MockS3UploadStream = require('./mockS3UploadStream');
const tmp = require('tmp');

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
  let schemaset = null;
  let exchanges = null;
  let references = null;
  let cfg = config({});
  let credentials = cfg.taskcluster.credentials;
  let tier = 'core';

  suiteSetup(async () => {
    schemaset = new SchemaSet({
      folder: './test/schemas',
      serviceName: 'whatever',
      constants: {'my-constant': 42},
    });
    const builder = new APIBuilder({
      title: 'Testing Stuff',
      description: 'This is for testing stuff!',
      serviceName: 'whatever',
      apiVersion: 'v1',
    });
    exchanges = new Exchanges({
      title: 'Testing Stuff Again',
      description: 'Another test!',
      serviceName: 'test',
      projectName: 'taskcluster-test',
      apiVersion: 'v1',
    });
    references = [
      {name: 'api', reference: builder.reference()},
      {name: 'events', reference: exchanges.reference({baseUrl: 'http://localhost'})},
    ];
  });

  test('tarball exists', async function() {
    let doc = await documenter({
      schemaset,
      tier,
      projectName: 'docs-testing',
    });
    assert.ok(await doc._tarballStream());
  });

  test('tarball contains docs and metadata', async function() {
    let doc = await documenter({
      docsFolder: './test/docs',
      tier,
      projectName: 'docs-testing',
    });
    let shoulds = [
      'docs/example.md',
      'docs/nested/nested-example.md',
    ];
    return assertInTarball(shoulds, await doc._tarballStream());
  });

  test('tarball contains schemas and metadata', async function() {
    let doc = await documenter({
      schemaset,
      tier,
      projectName: 'docs-testing',
    });
    let shoulds = [
      'schemas/foo.json',
      'schemas/bar.json',
      'docs/documenting-non-services.md',
      'docs/format.md',
    ];
    return assertInTarball(shoulds, await doc._tarballStream());
  });

  test('tarball contains references and metadata', async function() {
    let doc = await documenter({
      references,
      tier,
      projectName: 'docs-testing',
    });
    let shoulds = [
      'references/api.json',
      'references/events.json',
      'docs/documenting-non-services.md',
      'docs/format.md',
    ];
    return assertInTarball(shoulds, await doc._tarballStream());
  });

  test('tarball contains only metadata', async function() {
    let doc = await documenter({
      tier,
      projectName: 'docs-testing',
    });
    let shoulds = [
      'docs/documenting-non-services.md',
      'docs/format.md',
    ];
    return assertInTarball(shoulds, await doc._tarballStream());
  });

  const withWrittenDocs = async cb => {
    let doc = await documenter({
      docsFolder: './test/docs',
      schemaset,
      tier,
      projectName: 'docs-testing',
    });
    const tmpdir = tmp.dirSync({unsafeCleanup: true});
    const docsDir = path.join(tmpdir.name, 'docs_output_dir');
    try {
      await doc.write({docsDir});
      await cb(docsDir);
    } finally {
      tmpdir.removeCallback();
    }
  };

  test('write() writes a directory', async function() {
    await withWrittenDocs(docsDir => {
      const shoulds = [
        'docs/example.md',
        'docs/nested/nested-example.md',
      ];
      shoulds.forEach(name =>
        assert(fs.existsSync(path.join(docsDir, name)), `${name} should exist`));
    });
  });

  test('writen schemas are abstract', async function() {
    await withWrittenDocs(docsDir => {
      const schema = JSON.parse(fs.readFileSync(path.join(docsDir, 'schemas', 'bar.json')));
      assert.equal(schema.$id, '/schemas/whatever/bar.json#');
    });
  });

  const publishTest = async function(mock) {
    const options = {
      projectName: 'docs-testing',
      schemaset,
      tier,
      docsFolder: './test/docs/',
      references,
      bucket: cfg.bucket,
      publish: true,
    };
    if (mock) {
      options.aws = {accessKeyId: 'fake', secretAccessKey: 'fake'};
      options.S3UploadStream = MockS3UploadStream;
    } else {
      if (!credentials.clientId) {
        this.skip();
      }
      options.credentials = credentials;
      options.rootUrl = 'https://taskcluster.net';
    }

    await documenter(options);

    if (mock) {
      assert.deepEqual(MockS3UploadStream.uploads, [`${cfg.bucket}/docs-testing/latest.tar.gz`]);
    }
  };

  test('test publish tarball (real)', function() {
    return publishTest.call(this, false);
  });
  test('test publish tarball (mock)', function() {
    return publishTest.call(this, true);
  });
});
