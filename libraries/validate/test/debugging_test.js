suite('Debugging Tests', () => {
  let assert = require('assert');
  let SchemaSet = require('../');
  let rimraf = require('rimraf');
  let fs = require('fs');
  let intercept = require('intercept-stdout');
  let libUrls = require('taskcluster-lib-urls');

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
