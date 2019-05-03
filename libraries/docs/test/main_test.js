const assert = require('assert');
const documenter = require('../');
const fs = require('fs');
const tar = require('tar-stream');
const zlib = require('zlib');
const path = require('path');
const SchemaSet = require('taskcluster-lib-validate');
const APIBuilder = require('taskcluster-lib-api');
const {Exchanges} = require('taskcluster-lib-pulse');
const tmp = require('tmp');
const testing = require('taskcluster-lib-testing');

function assertInTarball(shoulds, tarball) {
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

suite(testing.suiteName(), () => {
  let schemaset = null;
  let exchanges = null;
  let references = null;
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

  test('tarball contains schemas', async function() {
    let doc = await documenter({
      schemaset,
      tier,
      projectName: 'docs-testing',
    });
    let shoulds = [
      'schemas/foo.json',
      'schemas/bar.json',
    ];
    return assertInTarball(shoulds, await doc._tarballStream());
  });

  test('tarball contains references', async function() {
    let doc = await documenter({
      references,
      tier,
      projectName: 'docs-testing',
    });
    let shoulds = [
      'references/api.json',
      'references/events.json',
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
        'schemas/foo.json',
        'schemas/bar.json',
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
});
