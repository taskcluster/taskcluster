suite('Valid Schema Tests', () => {
  let assert = require('assert');
  let validator = require('../');
  let debug = require('debug')('test');
  let validate = null;

  suiteSetup(async () => {
    validate = await validator({
      folder: 'test/schemas',
      baseurl: 'http://localhost:1203/',
      constants: {'my-constant': 42},
    });
  });

  test('load json', () => {
    let errors = validate(
        {value: 42},
        'http://localhost:1203/test-schema.json');
    assert.equal(errors, null);
  });

  test('load yml', () => {
    let errors = validate(
        {value: 42},
        'http://localhost:1203/yml-test-schema');
    assert.equal(errors, null);
  });

  test('load yaml', () => {
    let errors = validate(
        {value: 42},
        'http://localhost:1203/yaml-test-schema');
    assert.equal(errors, null);
  });

  test('$ref', () => {
    let errors = validate({
      reference: {value: 42},
      tid: new Date().toJSON(),
    }, 'http://localhost:1203/ref-test-schema');
    assert.equal(errors, null);
  });

  test('default values are inserted', () => {
    let json = {value: 42};
    let errors = validate(
        json,
        'http://localhost:1203/default-schema');
    assert.equal(errors, null);
    assert.equal(json.value, 42);
    assert.equal(json.optionalValue, 'my-default-value');
  });

  test('default values aren\'t overridden', () => {
    let json = {value: 42, optionalValue: 'already-here'};
    let errors = validate(
        json,
        'http://localhost:1203/default-schema');
    assert.equal(errors, null);
    assert.equal(json.value, 42);
    assert.equal(json.optionalValue, 'already-here');
  });

  test('default values with array and objects', () => {
    let json = {};
    let errors = validate(
        json,
        'http://localhost:1203/default-array-obj-schema');
    assert.equal(errors, null);
    assert.equal(json.optObj.hello, 'world');
    assert.equal(json.optArray.length, 1);
    assert.equal(json.optArray[0], 'my-default-value');
    assert.equal(json.optEmpty.length, 0);
  });

  test('no opts', async (done) => {
    let v = await validator();
    assert(v);
    done();
  });

  test('rejects errors', () => {
    let errors = validate(
        {value: 43},
        'http://localhost:1203/test-schema');
    debug(errors);
    assert.notEqual(errors, null);
  });

  test('automatic id', () => {
    let errors = validate(
        {value: 42},
        'http://localhost:1203/auto-named-schema');
    assert.equal(errors, null);
  });

});
