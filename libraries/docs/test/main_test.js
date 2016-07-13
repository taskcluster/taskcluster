suite('End to End', () => {
  let assert = require('assert');
  // let path = require('path');
  let documenter = require('../');
  let debug = require('debug')('test');
  let _ = require('lodash');
  let tar = require('tar-stream');
  let rootdir = require('app-root-dir');

  test('tarball exists', async function() {
    let schemas = [
      {id: 'http://example.com/foo.schema.json', schema: 'http://json-schema.org/draft-04/schema#'},
      {id: 'http://example.com/bar.schema.json', schema: 'http://json-schema.org/draft-04/schema#'},
    ];
    let doc = await documenter({
      schemas, // schema.id + content
    });
    assert.ok(doc.tarball); // testing tarball exists
  });

  test('tarball is empty', function() {
    let schemas = [];
    let docsFolder = [];

    let doc = documenter({
      schemas, // schema.id + content
      docsFolder: rootdir.get() + '/test/docs',
    });
    assert.equal(doc.tarball, null);
  });

  test('tarball contains only docs', async function(done) {
    let schemas = [];
    let shoulds = [
      'docs/example.md',
    ];

    let doc = await documenter({
      docsFolder: rootdir.get() + '/test/docs',
    });

    let tarball = doc.tarball;

    let extractor = tar.extract();
    extractor.on('entry', (header, stream, callback) => {
      let entryName = header.name;
      let contains = false;
      for (let expectedValue of shoulds) {
        if (expectedValue == entryName) {
          contains = true;
          break;
        }
      }
      assert.ok(contains);

      stream.on('end', () => {
        callback(); // ready for next entry
      });

      stream.resume(); // just auto drain the stream
    });

    extractor.on('finish', function() {
      done();
    });

    tarball.pipe(extractor);
  });

  test('tarball contains only schemas', async function(done) {
    let schemas = [
      {id: 'http://example.com/foo.schema.json', schema: 'http://json-schema.org/draft-04/schema#'},
      {id: 'http://example.com/bar.schema.json', schema: 'http://json-schema.org/draft-04/schema#'},
    ];

    let docFolder = [];

    let shoulds = [
      'schema/http://example.com/foo.schema.json',
      'schema/http://example.com/bar.schema.json',
    ];

    let doc = await documenter({
      schemas,
    });

    let tarball = doc.tarball;

    let extractor = tar.extract();
    extractor.on('entry', (header, stream, callback) => {
      let entryName = header.name;
      let contains = false;
      for (let expectedValue of shoulds) {
        if (expectedValue == entryName) {
          contains = true;
          break;
        }
      }
      assert.ok(contains);

      stream.on('end', () => {
        callback(); // ready for next entry
      });

      stream.resume(); // just auto drain the stream
    });

    extractor.on('finish', function() {
      done();
    });

    tarball.pipe(extractor);
  });

  test('simplest case with nothing to do', async function() {
    let doc = documenter({
      docsFolder: rootdir.get() + '/test/docs',
      bucket: 'taskcluster-raw-docs-test',
      project: 'taskcluster-lib-docs',
      version: '0.0.1',
    });
  });
});