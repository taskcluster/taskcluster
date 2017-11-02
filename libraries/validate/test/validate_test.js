suite('Valid Schema Tests', () => {
  let assert = require('assert');
  let validator = require('../');
  let debug = require('debug')('test');
  let _ = require('lodash');

  let validate = null;

  suiteSetup(async () => {
    validate = await validator({
      folder: 'test/schemas',
      baseUrl: 'http://localhost:1203/',
      constants: {'my-constant': 42},
    });
  });

  test('load json', () => {
    let error = validate(
      {value: 42},
      'http://localhost:1203/test-schema.json#');
    assert.equal(error, null);
  });

  test('load yml', () => {
    let error = validate(
      {value: 42},
      'http://localhost:1203/yml-test-schema#');
    assert.equal(error, null);
  });

  test('load yaml', () => {
    let error = validate(
      {value: 42},
      'http://localhost:1203/yaml-test-schema#');
    assert.equal(error, null);
  });

  test('$ref', () => {
    let error = validate({
      reference: {value: 42},
      tid: new Date().toJSON(),
    }, 'http://localhost:1203/ref-test-schema#');
    assert.equal(error, null);
  });

  test('default values are inserted', () => {
    let json = {value: 42};
    let error = validate(
      json,
      'http://localhost:1203/default-schema');
    assert.equal(error, null);
    assert.equal(json.value, 42);
    assert.equal(json.optionalValue, 'my-default-value');
  });

  test('default values aren\'t overridden', () => {
    let json = {value: 42, optionalValue: 'already-here'};
    let error = validate(
      json,
      'http://localhost:1203/default-schema');
    assert.equal(error, null);
    assert.equal(json.value, 42);
    assert.equal(json.optionalValue, 'already-here');
  });

  test('default values with array and objects', () => {
    let json = {};
    let error = validate(
      json,
      'http://localhost:1203/default-array-obj-schema');
    assert.equal(error, null);
    assert.equal(json.optObj.hello, 'world');
    assert.equal(json.optArray.length, 1);
    assert.equal(json.optArray[0], 'my-default-value');
    assert.equal(json.optEmpty.length, 0);
  });

  test('no opts', async () => validator());

  test('using constants.yml', async () => {
    try {
      let v = await validator({
        folder: 'test/schemas',
        constants: 'test/schemas/constants.yml',
        baseUrl: 'http://localhost:1203/',
      });
      let error = v(
        {value: 43},
        'http://localhost:1203/yml-test-schema#');
      return assert.equal(error, null);
    } catch (err) {
      return err;
    }
  });

  test('rejects poorly formed object', () => {
    let error = validate(
      {value: 43},
      'http://localhost:1203/test-schema#');
    debug(error);
    assert.notEqual(error, null);
  });

  test('messages for large schema are nice', () => {
    let error = validate(
      {},
      'http://localhost:1203/big-schema#');
    debug(error);
    assert.notEqual(error, null);
  });

  test('automatic id', () => {
    let error = validate(
      {value: 42},
      'http://localhost:1203/auto-named-schema#');
    assert.equal(error, null);
  });

  test('schemas available', () => {
    let schemas = validate.schemas;
    assert.equal(_.keys(schemas).length, 9);
    assert(_.includes(_.keys(schemas), 'default-schema.json'));
  });

});
