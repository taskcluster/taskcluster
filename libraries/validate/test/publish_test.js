const SchemaSet = require('../');
const awsMock = require('mock-aws-s3');
const os = require('os');
const path = require('path');
const rimraf = require('rimraf');
const debug = require('debug')('test');
const libUrls = require('taskcluster-lib-urls');
const testing = require('taskcluster-lib-testing');

suite(testing.suiteName(), () => {
  let s3 = null;
  let mockdir = path.join(os.tmpdir(), 'tc-lib-validate', 'buckets');

  suiteSetup(async () => {
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

  suiteTeardown(() => {
    rimraf.sync(mockdir);
  });

  test('schemas are uploaded', async () => {
    let shoulds = [
      'auto-named-schema',
      'yaml-test-schema',
      'test-schema',
      'yml-test-schema',
    ];
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
