const path = require('path');
const { omit } = require('lodash');
const Method = require('../src/Method');
const assert = require('assert').strict;

suite(path.basename(__filename), function() {
  suite('_check', function() {
    const method = {
      description: 'a method',
      mode: 'read',
      serviceName: 'test',
      args: 'x integer',
      returns: 'void',
      body: 'select *',
    };

    test('name must be lowercase', function() {
      assert.throws(
        () => Method.fromYamlFileContent('tEsTmEthOd', method, 'file.yml'),
        /has capital letters/);
    });

    test('description must exist', function() {
      assert.throws(
        () => Method.fromYamlFileContent('testmethod', omit(method, ['description']), 'file.yml'),
        /is missing description/);
    });

    test('mode must exist', function() {
      assert.throws(
        () => Method.fromYamlFileContent('testmethod', omit(method, ['mode']), 'file.yml'),
        /missing or bad mode/);
    });

    test('mode must be valid', function() {
      assert.throws(
        () => Method.fromYamlFileContent('testmethod', { ...omit(method, ['mode']), mode: 'admin' }, 'file.yml'),
        /missing or bad mode/);
    });

    test('serviceName must exist', function() {
      assert.throws(
        () => Method.fromYamlFileContent('testmethod', omit(method, ['serviceName']), 'file.yml'),
        /missing serviceName/);
    });

    test('args must exist', function() {
      assert.throws(
        () => Method.fromYamlFileContent('testmethod', omit(method, ['args']), 'file.yml'),
        /missing args/);
    });

    test('returns must exist', function() {
      assert.throws(
        () => Method.fromYamlFileContent('testmethod', omit(method, ['returns']), 'file.yml'),
        /missing returns/);
    });

    test('body must exist', function() {
      assert.throws(
        () => Method.fromYamlFileContent('testmethod', omit(method, ['body']), 'file.yml'),
        /missing body/);
    });

    test('extra props forbidden', function() {
      assert.throws(
        () => Method.fromYamlFileContent('testmethod', { ...method, uhoh: 10 }, 'file.yml'),
        /unexpected properties/);
    });
  });
});
