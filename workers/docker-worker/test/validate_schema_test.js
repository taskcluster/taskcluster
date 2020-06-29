const assert = require('assert').strict;
const {validatePayload} = require('../src/lib/util/validate_schema');
const SchemaSet = require('../src/lib/validate');
const libUrls = require('taskcluster-lib-urls');
const taskcluster = require('taskcluster-client');

suite('validate_schema_test.js', function() {
  const schemaset = new SchemaSet({
    serviceName: 'docker-worker',
    publish: false,
  });
  const rootUrl = libUrls.testRootUrl();
  const schema = libUrls.schema(rootUrl, 'docker-worker', 'v1/payload.json#');
  let validator;

  suiteSetup(async function() {
    validator = await schemaset.validator(rootUrl);
  });

  test('validatePayload success', function() {
    let payloadErrors = validatePayload(validator, {
      image: 'abc/def',
      maxRunTime: 60,
    }, {expires: new Date()}, schema);
    assert.deepEqual(payloadErrors, []);
  });

  test('validatePayload failure', function() {
    let payloadErrors = validatePayload(validator, {
      image: 'abc/def',
      maxRunTime: false,
    }, {expires: new Date()}, schema);
    assert(payloadErrors.some(e => e.match(/data\.maxRunTime should be number/)));
  });

  test('validatePayload with artifact expiring after task', function() {
    let payloadErrors = validatePayload(validator, {
      image: 'abc/def',
      maxRunTime: 60,
      artifacts: {
        foo: {
          type: 'file',
          path: '/bar',
          expires: taskcluster.fromNow('2h').toJSON(),
        },
      },
    }, {expires: taskcluster.fromNow('1h')}, schema);
    assert(payloadErrors.some(e => e.match(/must not be greater than task expiration./)));
  });
});
