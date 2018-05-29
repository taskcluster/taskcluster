suite('Publish Tests', () => {
  let assert = require('assert');
  let SchemaSet = require('../');
  let awsMock = require('mock-aws-s3');
  let os = require('os');
  let path = require('path');
  let rimraf = require('rimraf');
  let debug = require('debug')('test');
  let libUrls = require('taskcluster-lib-urls');

  let s3 = null;
  let mockdir = path.join(os.tmpdir(), 'tc-lib-validate', 'buckets');

  before(async () => {
    debug('Using tmpdir: ' + mockdir);
    awsMock.config.basePath = mockdir;
    rimraf.sync(mockdir);

    s3 = awsMock.S3();

    const schemaset = new SchemaSet({
      folder: 'test/publish-schemas',
      serviceName: 'whatever',
      constants: {'my-constant': 42},
      aws: {
        accessKeyId: 'doesntmatter',
        secretAccessKey: 'thesearentused',
      },
      publish: true,
      s3Provider: s3,
    });

    // publishing occurs as a side-effect of creating a validator..
    await schemaset.validator(libUrls.testRootUrl());
  });

  after(() => {
    rimraf.sync(mockdir);
  });

  test('schemas are uploaded', async () => {
    let shoulds = [
      'auto-named-schema',
      'yaml-test-schema',
      'test-schema',
      'yml-test-schema',
    ];
    let bads = [];
    for (let key of shoulds) {
      s3.getObject({
        Bucket: 'schemas.taskcluster.net',
        Key: 'test/v1/' + key + '.json',
      }, (err, data) => {
        if (err) {
          return err;
        }
      });
    }
    return;
  });
});
