suite("Publish Tests", () => {
  let assert = require('assert');
  let validator = require('../');
  let AWSMock = require('mock-aws-s3');
  let rimraf = require('rimraf');

  let mockdir = '/tmp/tc-lib-validate/buckets';
  let s3 = null;
  let validate = null;

  suiteSetup( async () => {
    AWSMock.config.basePath = mockdir;
    rimraf.sync(mockdir);

    s3 = AWSMock.S3();

    validate = await validator({
      prefix: 'test/v1/',
      folder: 'test/publish-schemas',
      baseurl: 'http://localhost:1203/',
      constants: {'my-constant': 42},
      aws: {
        accessKeyId: 'doesntmatter',
        secretAccessKey: 'thesearentused',
      },
      publish: true,
      s3Provider: s3,
    });
  });

  suiteTeardown( () => {
    rimraf.sync(mockdir);
  });

  test("Schemas are uploaded", (done) => {
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
        Key: 'test/v1/' + key + '.json'
      }, (err, data) => {
        if (err) {
          done(err);
        }
      });
    }
    done();
  });
});
