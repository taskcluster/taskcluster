suite("Validate", () => {
  let assert = require('assert');
  let validator = require('../');
  let AWSMock = require('mock-aws-s3');

  let schemaTestBucket = 'testbucket'
  let s3 = null;
  let validate = null;

  suiteSetup( async () => {
    AWSMock.config.basePath = '/tmp/tc-lib-validate/buckets'

    s3 = AWSMock.S3({
          params: { Bucket: schemaTestBucket }
    });

    validate = await validator({
      prefix: 'test/v1/',
      folder: 'test/schemas',
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

  test("validates schema-matching docs", () => {
    console.log(validate({}));
    assert(false);
  });

  test("rejects non-schema-matching docs", () => {
    console.log(validate({}));
    assert(false);
  });

  test("publish correctly", () => {
    console.log(validate({}));
    assert(false);
  });
});
