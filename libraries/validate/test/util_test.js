const assert = require('assert');
const {checkRefs} = require('../src/util');

suite('test_util.js', function() {
  suite('checkRefs', function() {
    // include some arrays and objects to test the "deepness" of the check
    const schemaWith = innards => ({
      anyOf: [{
        type: 'object',
        properties: {
          foo: innards,
        },
      }],
    });

    test('on a schema with no refs', function() {
      checkRefs(schemaWith({type: 'string'}), 'thisservice');
    });

    test('on a schema with a local ref', function() {
      checkRefs(schemaWith({$ref: 'another-file.json'}), 'thisservice');
    });

    test('on a schema with a rooted ref (not allowed)', function() {
      assert.throws(
        () => checkRefs(schemaWith({$ref: '/schemas/thisservice/file.json'}), 'thisservice'),
        Error,
        /rooted URIs *. are not allowed/);
    });

    test('on a schema with a /-relative ref (not allowed)', function() {
      assert.throws(
        () => checkRefs(schemaWith({$ref: '/schemas/foo.json'}), 'thisservice'),
        Error,
        /absolute URIs *. are not allowed/);
    });

    test('on a schema with an "https:.." ref (not allowed)', function() {
      assert.throws(
        () => checkRefs(schemaWith({$ref: 'https://schemas.taskcluster.net/foo.json'}), 'thisservice'),
        Error,
        /absolute URIs *. are not allowed/);
    });
  });
});
