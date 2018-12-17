const assert = require('assert');
const _ = require('lodash');
const Ajv = require('ajv');
const {getCommonSchemas} = require('../src/common-schemas');

suite('metaschema_test.js', function() {
  suiteSetup('setup Ajv', function() {
    const ajv = new Ajv({
      format: 'full',
      verbose: true,
      allErrors: true,
      validateSchema: false,
    });
    ajv.addMetaSchema(require('ajv/lib/refs/json-schema-draft-06.json'));

    // add the metadata metaschema
    const schemas = getCommonSchemas();
    ajv.addMetaSchema(_.find(schemas, {filename: 'schemas/metaschema.yml'}).content);
    ajv.addMetaSchema(_.find(schemas, {filename: 'schemas/metadata-metaschema.yml'}).content);

    validate = (content, failureCheck) => {
      const problems = [];
      try {
        ajv.validateSchema(content);
        if (ajv.errors) {
          ajv
            .errorsText(ajv.errors, {separator: '%%/%%', dataVar: 'schema'})
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

  suite('metaschema', function() {
    const $schema = '/schemas/common/metaschema.json#';

    test('if properties are given, additionalProperties must be present', function() {
      validate({
        $schema,
        type: 'object',
        properties: {x: {type: 'string'}},
        required: [],
      }, f => f.match(/schema should have properties .* when property properties is present/));
    });

    test('if properties are given, type must be present', function() {
      validate({
        $schema,
        additionalProperties: true,
        properties: {x: {type: 'string'}},
        required: [],
      }, f => f.match(/schema should have properties .* when property properties is present/));
    });

    test('if properties are given, required must be present', function() {
      validate({
        $schema,
        additionalProperties: true,
        type: 'object',
        properties: {x: {type: 'string'}},
      }, f => f.match(/schema should have properties .* when property properties is present/));
    });

    test('if entries are given, additionalProperties must be present', function() {
      validate({
        $schema,
        type: 'object',
        entries: {type: 'string'},
      }, f => f.match(/schema should have properties type, uniqueItems when property entries is present/));
    });

    test('if entries are given, type must be present', function() {
      validate({
        $schema,
        uniqueItems: true,
        entries: {type: 'string'},
      }, f => f.match(/schema should have properties type, uniqueItems when property entries is present/));
    });
  });

  suite('metadata-metaschema', function() {
    const $schema = '/schemas/common/metadata-metaschema.json#';
    const metadata = {name: 'sch', version: 1};

    test('metadata is required', function() {
      validate({
        $schema,
      }, f => f.match(/schema should have required property 'metadata'/));
    });

    test('metadata.name is required', function() {
      validate({
        $schema,
        metadata: {version: 0},
      }, f => f.match(/schema.metadata should have required property 'name'/));
    });

    test('metadata.version is required', function() {
      validate({
        $schema,
        metadata: {name: 'foo'},
      }, f => f.match(/schema.metadata should have required property 'version'/));
    });

    test('metadata.otherProperty is forbidden', function() {
      validate({
        $schema,
        metadata: {name: 'foo', version: 0, otherProperty: 'foo'},
      }, f => f.match(/schema.metadata should NOT have additional properties/));
    });

    test('fully specified schema is valid', function() {
      validate({
        $schema, metadata,
      });
    });
  });
});
