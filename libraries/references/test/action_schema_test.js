const assert = require('assert');
const fs = require('fs');
const {getCommonSchemas} = require('../src/common-schemas');
const libUrls = require('taskcluster-lib-urls');
const {makeSerializable} = require('../src/serializable');
const mockFs = require('mock-fs');
const References = require('..');

suite('action_schema_test.js', function() {
  const rootUrl = libUrls.testRootUrl();

  const references = new References({
    schemas: getCommonSchemas(),
    references: [],
  });
  const ajv = references.asAbsolute(rootUrl).makeAjv();

  const validate = content => {
    ajv.validate(
      'https://tc-tests.example.com/schemas/common/action-schema-v1.json#',
      content);
    if (ajv.errors) {
      throw new Error(ajv.errorsText(ajv.errors));
    }
  };

  const validateFails = content => {
    ajv.validate(
      'https://tc-tests.example.com/schemas/common/action-schema-v1.json#',
      content);
    if (!ajv.errors) {
      throw new Error('no errors');
    }
  };

  test('empty list is OK', function() {
    validate({
      version: 1,
      variables: {},
      actions: [],
    });
  });

  test('action with bogus kind fails', function() {
    validateFails({
      version: 1,
      variables: {},
      actions: [{
        kind: 'bogus',
      }],
    });
  });

  test('task kind is OK', function() {
    validate({
      version: 1,
      variables: {},
      actions: [{
        kind: 'task',
        name: 'act',
        title: 'Act',
        description: 'Acts.',
        context: [],
        schema: {},
        task: {},
      }],
    });
  });

  test('hook kind is OK', function() {
    validate({
      version: 1,
      variables: {},
      actions: [{
        kind: 'hook',
        name: 'act',
        title: 'Act',
        description: 'Acts.',
        context: [],
        schema: {},
        hookGroupId: 'hgid',
        hookId: 'hid',
        hookPayload: {},
      }],
    });
  });

  test('action.extra is allowed', function() {
    validate({
      version: 1,
      variables: {},
      actions: [{
        kind: 'hook',
        name: 'act',
        title: 'Act',
        description: 'Acts.',
        context: [],
        schema: {},
        hookGroupId: 'hgid',
        hookId: 'hid',
        hookPayload: {},
        extra: {
          mystuff: true,
        },
      }],
    });
  });

});
