import { getCommonSchemas } from '../src/common-schemas.js';
import libUrls from 'taskcluster-lib-urls';
import References from '../src/index.js';
import testing from '@taskcluster/lib-testing';

suite(testing.suiteName(), function() {
  const rootUrl = libUrls.testRootUrl();

  let ajv;
  const getAjv = async () => {
    if (!ajv) {
      const references = new References({
        schemas: await getCommonSchemas(),
        references: [],
      });
      ajv = references.asAbsolute(rootUrl).makeAjv();
    }
    return ajv;
  };

  const validate = async content => {
    (await getAjv()).validate(
      'https://tc-tests.example.com/schemas/common/action-schema-v1.json#',
      content);
    if (ajv.errors) {
      throw new Error(ajv.errorsText(ajv.errors));
    }
  };

  const validateFails = async content => {
    (await getAjv()).validate(
      'https://tc-tests.example.com/schemas/common/action-schema-v1.json#',
      content);
    if (!ajv.errors) {
      throw new Error('no errors');
    }
  };

  test('empty list is OK', async function() {
    await validate({
      version: 1,
      variables: {},
      actions: [],
    });
  });

  test('action with bogus kind fails', async function() {
    await validateFails({
      version: 1,
      variables: {},
      actions: [{
        kind: 'bogus',
      }],
    });
  });

  test('task kind is OK', async function() {
    await validate({
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

  test('hook kind is OK', async function() {
    await validate({
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

  test('action.extra is allowed', async function() {
    await validate({
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
