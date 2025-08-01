import assert from 'assert';
import SchemaSet from '../src/index.js';
import debugFactory from 'debug';
const debug = debugFactory('test');
import libUrls from 'taskcluster-lib-urls';
import testing from '@taskcluster/lib-testing';

suite(testing.suiteName(), () => {
  const rootUrl = libUrls.testRootUrl();

  let validate = null;

  suiteSetup(async () => {
    const schemaset = new SchemaSet({
      folder: 'test/schemas',
      serviceName: 'whatever',
      constants: { 'my-constant': 42 },
    });
    validate = await schemaset.validator(libUrls.testRootUrl());
  });

  test('load json', () => {
    let error = validate(
      { value: 42 },
      libUrls.schema(rootUrl, 'whatever', '/v1/test-schema.json#'));
    assert.equal(error, null);
  });

  test('load yml', () => {
    let error = validate(
      { value: 42 },
      libUrls.schema(rootUrl, 'whatever', '/v1/yml-test-schema#'));
    assert.equal(error, null);
  });

  test('sub-schemas', () => {
    let error = validate(
      42,
      libUrls.schema(rootUrl, 'whatever', '/v1/test-schema.json#/properties/value'));
    assert.equal(error, null);
  });

  test('load yaml', () => {
    let error = validate(
      { value: 42 },
      libUrls.schema(rootUrl, 'whatever', '/v1/yaml-test-schema#'));
    assert.equal(error, null);
  });

  test('$ref', () => {
    let error = validate({
      referenceWithDotDot: { value: 42 },
      localReference: { value: 42 },
      tid: new Date().toJSON(),
    }, libUrls.schema(rootUrl, 'whatever', '/v1/ref-test-schema#'));
    assert.equal(error, null);
  });

  test('default values are inserted', () => {
    let json = { value: 42 };
    let error = validate(
      json,
      libUrls.schema(rootUrl, 'whatever', '/v1/default-schema'));
    assert.equal(error, null);
    assert.equal(json.value, 42);
    assert.equal(json.optionalValue, 'my-default-value');
  });

  test('default values aren\'t overridden', () => {
    let json = { value: 42, optionalValue: 'already-here' };
    let error = validate(
      json,
      libUrls.schema(rootUrl, 'whatever', '/v1/default-schema'));
    assert.equal(error, null);
    assert.equal(json.value, 42);
    assert.equal(json.optionalValue, 'already-here');
  });

  test('default values with array and objects', () => {
    let json = {};
    let error = validate(
      json,
      libUrls.schema(rootUrl, 'whatever', '/v1/default-array-obj-schema'));
    assert.equal(error, null);
    assert.equal(json.optObj.hello, 'world');
    assert.equal(json.optArray.length, 1);
    assert.equal(json.optArray[0], 'my-default-value');
    assert.equal(json.optEmpty.length, 0);
  });

  test('using constants.yml', async () => {
    const s = new SchemaSet({
      folder: 'test/schemas',
      serviceName: 'whatever',
    });
    const v = await s.validator(libUrls.testRootUrl());
    let error = v(
      { value: 43 },
      libUrls.schema(rootUrl, 'whatever', '/v1/yml-test-schema#'));
    assert.equal(error, null);
  });

  test('rejects poorly formed object', () => {
    let error = validate(
      { value: 43 },
      libUrls.schema(rootUrl, 'whatever', '/v1/test-schema#'));
    debug(error);
    assert.notEqual(error, null);
  });

  test('messages for large schema are nice', () => {
    let error = validate(
      {},
      libUrls.schema(rootUrl, 'whatever', '/v1/big-schema#'));
    debug(error);
    assert.notEqual(error, null);
  });

  test('automatic id', () => {
    let error = validate(
      { value: 42 },
      libUrls.schema(rootUrl, 'whatever', '/v1/auto-named-schema#'));
    assert.equal(error, null);
  });

  test('message specifies absolute schema URL', () => {
    let error = validate(
      { value: 42, unwanted_value: 1729 },
      libUrls.schema(rootUrl, 'whatever', '/v1/default-schema'));
    assert.notEqual(error, null);
    assert(error.includes(`Rejecting Schema: ${rootUrl}`), error);
  });

  test('message specifies unwanted additional property', () => {
    let error = validate(
      { value: 42, unwanted_value: 1729 },
      libUrls.schema(rootUrl, 'whatever', '/v1/default-schema'));
    assert.notEqual(error, null);
    assert(error.includes('data must NOT have additional properties: "unwanted_value"'));
  });
});
