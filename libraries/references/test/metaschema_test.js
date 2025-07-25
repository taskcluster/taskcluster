import { getCommonSchemas } from '../src/common-schemas.js';
import References from '../src/index.js';
import libUrls from 'taskcluster-lib-urls';
import testing from '@taskcluster/lib-testing';

suite(testing.suiteName(), function() {
  let validate;

  suiteSetup('setup Ajv', function() {
    let _ajv;
    const getAjv = async () => {
      if (!_ajv) {
        const references = new References({
          schemas: await getCommonSchemas(),
          references: [],
        });
        _ajv = references.asAbsolute(libUrls.testRootUrl()).makeAjv();
      }
      return _ajv;
    };

    validate = async (content, failureCheck) => {
      const problems = [];
      let ajv = await getAjv();
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

    test('metadata is required', async function() {
      await validate({
        $schema,
      }, f => f.match(/schema must have required property 'metadata'/));
    });

    test('metadata.name is required', async function() {
      await validate({
        $schema,
        metadata: { version: 0 },
      }, f => f.match(/schema.metadata must have required property 'name'/));
    });

    test('metadata.version is required', async function() {
      await validate({
        $schema,
        metadata: { name: 'foo' },
      }, f => f.match(/schema.metadata must have required property 'version'/));
    });

    test('metadata.otherProperty is forbidden', async function() {
      await validate({
        $schema,
        metadata: { name: 'foo', version: 0, otherProperty: 'foo' },
      }, f => f.match(/schema.metadata must NOT have additional properties/));
    });

    test('fully specified schema is valid', async function() {
      await validate({
        $schema, metadata,
      });
    });
  });
});
