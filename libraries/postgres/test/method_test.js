const path = require('path');
const {omit} = require('lodash');
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

    test('description must exist', function() {
      assert.throws(
        () => Method.fromYamlFile('testmethod', omit(method, ['description']), 'file.yml'),
        /is missing description/);
    });

    test('mode must exist', function() {
      assert.throws(
        () => Method.fromYamlFile('testmethod', omit(method, ['mode']), 'file.yml'),
        /missing or bad mode/);
    });

    test('mode must be valid', function() {
      assert.throws(
        () => Method.fromYamlFile('testmethod', {...omit(method, ['mode']), mode: 'admin'}, 'file.yml'),
        /missing or bad mode/);
    });

    test('serviceName must exist', function() {
      assert.throws(
        () => Method.fromYamlFile('testmethod', omit(method, ['serviceName']), 'file.yml'),
        /missing serviceName/);
    });

    test('args must exist', function() {
      assert.throws(
        () => Method.fromYamlFile('testmethod', omit(method, ['args']), 'file.yml'),
        /missing args/);
    });

    test('returns must exist', function() {
      assert.throws(
        () => Method.fromYamlFile('testmethod', omit(method, ['returns']), 'file.yml'),
        /missing returns/);
    });

    test('body must exist', function() {
      assert.throws(
        () => Method.fromYamlFile('testmethod', omit(method, ['body']), 'file.yml'),
        /missing body/);
    });
  });
});
