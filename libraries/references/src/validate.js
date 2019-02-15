const regexEscape = require('regex-escape');
const {URL} = require('url');
const libUrls = require('taskcluster-lib-urls');

exports.validate = (references) => {
  const problems = [];

  // first check for some basic structural issues that will cause Ajv to
  // be sad..

  let schemaPattern; // capture group 1 === prefix up to and including service name)
  if (references.rootUrl === 'https://taskcluster.net') {
    schemaPattern = new RegExp('(^https:\/\/schemas\.taskcluster\.net\/[^\/]*\/).*\.json#');
  } else {
    schemaPattern = new RegExp(`(^${regexEscape(references.rootUrl)}\/schemas\/[^\/]*\/).*\.json#`);
  }

  for (let {filename, content} of references.schemas) {
    if (!content.$id) {
      problems.push(`schema ${filename} has no $id`);
    } else if (!schemaPattern.test(content.$id)) {
      problems.push(`schema ${filename} has an invalid $id '${content.$id}' ` +
        '(expected \'/schemas/<something>/something>.json#\'');
    }

    if (!content.$schema) {
      problems.push(`schema ${filename} has no $schema`);
    } else if (!content.$schema.startsWith('http://json-schema.org') &&
      !references.getSchema(content.$schema, {skipValidation: true})) {
      problems.push(`schema ${filename} has invalid $schema (must be defined here or be on at json-schema.org)`);
    }
  }

  const metadataMetaschema = libUrls.schema(references.rootUrl, 'common', 'metadata-metaschema.json#');
  for (let {filename, content} of references.references) {
    if (!content.$schema) {
      problems.push(`reference ${filename} has no $schema`);
    } else if (!references.getSchema(content.$schema, {skipValidation: true})) {
      problems.push(`reference ${filename} has invalid $schema (must be defined here)`);
    } else {
      const schema = references.getSchema(content.$schema, {skipValidation: true});
      if (schema.$schema !== metadataMetaschema) {
        problems.push(`reference ${filename} has schema '${content.$schema}' which does not have ` +
          'the metadata metaschema');
      }
    }
  }

  // if that was OK, check references in all schemas

  if (!problems.length) {
    for (let {filename, content} of references.schemas) {
      const idUrl = new URL(content.$id, references.rootUrl);

      const match = schemaPattern.exec(content.$id);
      const refRoot = new URL(match[1], references.rootUrl);

      const refOk = ref => {
        if (ref.startsWith('#')) {
          return true; // URL doesn't like fragment-only relative URLs, but they are OK..
        }

        const refUrl = new URL(ref, idUrl).toString();
        return refUrl.startsWith(refRoot) || refUrl.startsWith('http://json-schema.org/');
      };

      const checkRefs = (value, path) => {
        if (Array.isArray(value)) {
          value.forEach((v, i) => checkRefs(v, `${path}[${i}]`));
        } else if (typeof value === 'object') {
          if (value.$ref && Object.keys(value).length === 1) {
            if (!refOk(value.$ref)) {
              problems.push(`schema ${filename} $ref at ${path} is not allowed`);
            }
          } else {
            for (const [k, v] of Object.entries(value)) {
              checkRefs(v, `${path}.${k}`);
            }
          }
        }
      };
      if (!content.$id.endsWith('metadata-metaschema.json#')) {
        checkRefs(content, 'schema');
      }
    }
  }

  // if that was OK, validate everything against its declared schema. This is the part
  // that requires a real rootUrl, since $schema cannot be a relative URL

  if (!problems.length) {
    const ajv = references.makeAjv({skipValidation: true});

    for (let {filename, content} of references.schemas) {
      try {
        ajv.validateSchema(content);
      } catch (err) {
        problems.push(err.toString());
        continue;
      }
      if (ajv.errors) {
        ajv
          .errorsText(ajv.errors, {separator: '%%/%%', dataVar: 'schema'})
          .split('%%/%%')
          .forEach(err => problems.push(`${filename}: ${err}`));
      }
    }

    for (let {filename, content} of references.references) {
      try {
        ajv.validate(content.$schema, content);
      } catch (err) {
        problems.push(err.toString());
        continue;
      }
      if (ajv.errors) {
        ajv
          .errorsText(ajv.errors, {separator: '%%/%%', dataVar: 'reference'})
          .split('%%/%%')
          .forEach(err => problems.push(`${filename}: ${err}`));
      }
    }
  }

  // If we're still doing OK, let's check that the schema references from various
  // reference entries are OK

  if (!problems.length) {
    const metaschemaUrl = libUrls.schema(references.rootUrl, 'common', 'metaschema.json#');
    // check that a schema link is relative to the service
    for (let {filename, content} of references.references) {
      const checkRelativeSchema = (name, serviceName, schemaName, i) => {
        if (schemaName.match(/^\/|^[a-z]*:|^\.\./)) {
          problems.push(`${filename}: entries[${i}].${name} is not relative to the service`);
          return;
        }
        const fullSchema = libUrls.schema(references.rootUrl, serviceName, schemaName);
        const schema = references.getSchema(fullSchema, {skipValidation: true});
        if (!schema) {
          problems.push(`${filename}: entries[${i}].${name} does not exist`);
        } else if (schema.$schema !== metaschemaUrl) {
          problems.push(`${serviceName}/${schemaName}'s $schema is not the metaschema`);
        }
      };

      const metadata = references.getSchema(content.$schema, {skipValidation: true}).metadata;
      if (metadata.name === 'api') {
        if (metadata.version === 0) {
          content.entries.forEach(({input, output}, i) => {
            if (input) {
              checkRelativeSchema('input', content.serviceName, input, i);
            }
            if (output) {
              checkRelativeSchema('output', content.serviceName, output, i);
            }
          });
        } else {
          problems.push(`${filename}: unknown metadata.version ${metadata.version}`);
        }
      } else if (metadata.name === 'exchanges') {
        if (metadata.version === 0) {
          content.entries.forEach(({schema}, i) => {
            checkRelativeSchema('schema', content.serviceName, schema, i);
          });
        } else {
          problems.push(`${filename}: unknown metadata.version ${metadata.version}`);
        }
      } else if (metadata.name === 'logs') {
        // Nothing to do for now
        // TODO: Start validating fields with schemas?
      } else {
        problems.push(`${filename}: unknown metadata.name ${metadata.name}`);
      }
    }
  }

  if (problems.length) {
    throw new ValidationProblems(problems);
  }
};

/**
 * An error indicating validation failed.  This has a ;-separated
 * message, or the problems themselves are in the array err.problems.
 */
class ValidationProblems extends Error {
  constructor(problems) {
    super(problems.join('; '));
    this.problems = problems;
  }
}

exports.ValidationProblems = ValidationProblems;
