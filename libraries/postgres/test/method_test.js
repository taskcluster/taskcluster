import path from 'node:path';
import _ from 'lodash';
import Method from '../src/Method.js';
import { strict as assert } from 'node:assert';

const { omit } = _;

const __filename = new URL('', import.meta.url).pathname;

suite(path.basename(__filename), () => {
  suite('_check', () => {
    const method = {
      description: 'a method',
      mode: 'read',
      serviceName: 'test',
      args: 'x integer',
      returns: 'void',
      body: 'select *',
    };

    test('name must be lowercase', () => {
      assert.throws(
        () => Method.fromYamlFileContent('tEsTmEthOd', method, 'file.yml'),
        /has capital letters/);
    });

    test('description must exist', () => {
      assert.throws(
        () => Method.fromYamlFileContent('testmethod', omit(method, ['description']), 'file.yml'),
        /is missing description/);
    });

    test('mode must exist', () => {
      assert.throws(
        () => Method.fromYamlFileContent('testmethod', omit(method, ['mode']), 'file.yml'),
        /missing or bad mode/);
    });

    test('mode must be valid', () => {
      assert.throws(
        () => Method.fromYamlFileContent('testmethod', { ...omit(method, ['mode']), mode: 'admin' }, 'file.yml'),
        /missing or bad mode/);
    });

    test('serviceName must exist', () => {
      assert.throws(
        () => Method.fromYamlFileContent('testmethod', omit(method, ['serviceName']), 'file.yml'),
        /missing serviceName/);
    });

    test('args must exist', () => {
      assert.throws(
        () => Method.fromYamlFileContent('testmethod', omit(method, ['args']), 'file.yml'),
        /missing args/);
    });

    test('returns must exist', () => {
      assert.throws(
        () => Method.fromYamlFileContent('testmethod', omit(method, ['returns']), 'file.yml'),
        /missing returns/);
    });

    test('body must exist', () => {
      assert.throws(
        () => Method.fromYamlFileContent('testmethod', omit(method, ['body']), 'file.yml'),
        /missing body/);
    });

    test('extra props forbidden', () => {
      assert.throws(
        () => Method.fromYamlFileContent('testmethod', { ...method, uhoh: 10 }, 'file.yml'),
        /unexpected properties/);
    });
  });
});
