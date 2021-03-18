const { getCommonSchemas } = require('../src/common-schemas');
const References = require('..');
const libUrls = require('taskcluster-lib-urls');
const testing = require('taskcluster-lib-testing');

suite(testing.suiteName(), function() {
  let validate;

  suiteSetup('setup Ajv', function() {
    const references = new References({
      schemas: getCommonSchemas(),
      references: [],
    });
    const ajv = references.asAbsolute(libUrls.testRootUrl()).makeAjv();

    validate = (content, failureCheck) => {
      const problems = [];
      try {
        ajv.validateSchema(content);
        if (ajv.errors) {
          ajv
            .errorsText(ajv.errors, { separator: '%%/%%', dataVar: 'schema' })
            .split('%%/%%')
            .forEach(err => problems.push(err));
        }
      } catch (err) {
        problems.push(err.toString());
      }
      if (!failureCheck) {
        if (problems.length) {
          throw new Error(problems.join('; '));
        }
      } else if (!problems.some(failureCheck)) {
        throw new Error(problems.length > 0 ? problems.join('; ') : 'Did not any problems (but expected some)');
      }
    };
  });

  suite('metadata-metaschema', function() {
    const $schema = 'https://tc-tests.example.com/schemas/common/metadata-metaschema.json#';
    const metadata = { name: 'sch', version: 1 };

    test('metadata is required', function() {
      validate({
        $schema,
      }, f => f.match(/schema should have required property 'metadata'/));
    });

    test('metadata.name is required', function() {
      validate({
        $schema,
        metadata: { version: 0 },
      }, f => f.match(/schema.metadata should have required property 'name'/));
    });

    test('metadata.version is required', function() {
      validate({
        $schema,
        metadata: { name: 'foo' },
      }, f => f.match(/schema.metadata should have required property 'version'/));
    });

    test('metadata.otherProperty is forbidden', function() {
      validate({
        $schema,
        metadata: { name: 'foo', version: 0, otherProperty: 'foo' },
      }, f => f.match(/schema.metadata should NOT have additional properties/));
    });

    test('fully specified schema is valid', function() {
      validate({
        $schema, metadata,
      });
    });
  });
});
