suite('Publish Tests', () => {
  let assert = require('assert');
  let validator = require('../');
  let awsMock = require('mock-aws-s3');
  let os = require('os');
  let path = require('path');
  let rimraf = require('rimraf');
  let debug = require('debug')('test');

  let s3 = null;
  let validate = null;
  let mockdir = path.join(os.tmpdir(), 'tc-lib-validate', 'buckets');

  suiteSetup(async () => {
    debug('Using tmpdir: ' + mockdir);
    awsMock.config.basePath = mockdir;
    rimraf.sync(mockdir);

    s3 = awsMock.S3();

    validate = await validator({
      prefix: 'test/v1/',
      folder: 'test/publish-schemas',
      baseUrl: 'http://localhost:1203/',
      constants: {'my-constant': 42},
      aws: {
        accessKeyId: 'doesntmatter',
        secretAccessKey: 'thesearentused',
      },
      publish: true,
      preview: true,
      writeFile: true,
      s3Provider: s3,
    });
  });

  suiteTeardown(() => {
    rimraf.sync(mockdir);
  });

  test('schemas are uploaded', (done) => {
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
          done(err);
        }
      });
    }
    done();
  });
});
