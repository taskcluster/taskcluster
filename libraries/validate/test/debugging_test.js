const assert = require('assert');
const SchemaSet = require('../');
const rimraf = require('rimraf');
const fs = require('fs');
const intercept = require('intercept-stdout');
const libUrls = require('taskcluster-lib-urls');
const testing = require('taskcluster-lib-testing');

suite(testing.suiteName(), () => {
  test('preview previews', async function() {
    let stdout = '';
    const unhook = intercept(txt => {
      stdout += txt;
      return '';
    });
    try {
      const schemaset = new SchemaSet({
        folder: 'test/publish-schemas',
        serviceName: 'whatever',
        constants: {'my-constant': 42},
        preview: true,
      });
      await schemaset.validator(libUrls.testRootUrl());
    } finally {
      unhook();
    }

    assert(/JSON SCHEMA PREVIEW BEGIN:/.test(stdout));
  });

  test('writeFile writes files', async function() {
    try {
      const schemaset = new SchemaSet({
        folder: 'test/publish-schemas',
        serviceName: 'whatever',
        constants: {'my-constant': 42},
        writeFile: true,
      });

      await schemaset.validator(libUrls.testRootUrl());
      assert(fs.existsSync('rendered_schemas/v1/yml-test-schema.json'));
    } finally {
      rimraf.sync('rendered_schemas');
    }
  });
});
