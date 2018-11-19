const builtServices = require('./built-services');
const {makeSerializable, fromSerializable} = require('./serializable');
const {writeUriStructured, readUriStructured} = require('./uri-structured');
const {getCommonSchemas} = require('./common-schemas');
const Ajv = require('ajv');
const merge = require('lodash/merge');
const {URL} = require('url');
const regexEscape = require('regex-escape');
const libUrls = require('taskcluster-lib-urls');

/**
 * Representation of a set of references. This is considered immutable after
 * construction.
 *
 * The public properties of this 
 *  * `rootUrl` - the rootUrl (for absolute) or undefined (for abstract)
 *  * `schemas` - an array of schemas of the form {filename, content}
 *  * `references` - an array of references of the form {filename, content}
 *
 * The internal data structure is deliberately simple so as not to assume too
 * much validity outside of the validate() function.  The stored filenames are
 * used only for error messages from validation, etc.
 */
class References {
  constructor({rootUrl, schemas, references}) {
    this.rootUrl = rootUrl;
    this.schemas = schemas;
    this.references = references;

    // avoid validating more than once
    this._validated = false;

    // caches to make operations faster, but which assume validity
    this._schemasById = null;
  }

  /**
   * Create a new representation from a "Built Services" formatted
   * directory.
   *
   * The data in the directory will be amended with the "common" schemas and
   * meta-schemas.
   */
  static fromBuiltServices({directory}) {
    let {references, schemas} = builtServices.load({directory});
    schemas = schemas.concat(getCommonSchemas());
    return new References({
      rootUrl: undefined,
      references,
      schemas});
  }

  /**
   * Create a new representation from a URI-structured directory.
   * No new "common" schemas or meta-schemas will be added.
   *
   * If the data is absolute, provide the rootUrl; for abstract data, pass
   * rootUrl: undefined.
   */
  static fromUriStructured({directory, rootUrl}) {
    return References.fromSerializable({
      serializable: readUriStructured({directory}),
      rootUrl,
    });
  }

  /**
   * Create a new representation from a serializable format.
   * No new "common" schemas or meta-schemas will be added.
   *
   * If the data is absolute, provide the rootUrl; for abstract data, pass
   * rootUrl: undefined.
   */
  static fromSerializable({serializable, rootUrl}) {
    return new References({
      rootUrl,
      ...fromSerializable({serializable}),
    });
  }

  /**
   * Validate that all components of this instance are self-consistent.  Throws
   * an exception for any discovered issues.  This can optionally be done with
   * respect to a rootUrl, but this is only useful for performance reasons.
   */
  validate() {
    if (this._validated) {
      return;
    }

    // to validate an abstract References, temporarily qualify it with a
    // rootUrl that is unlikely to appear in the content otherwise
    // (specifically, not the testRootUrl)
    if (!this.rootUrl) {
      const absolute = this.asAbsolute('https://validate-root.example.com');
      absolute.validate();
      this._validated = true;
      return;
    }

    const problems = [];

    // first check for some basic structural issues that will cause Ajv to
    // be sad..

    let schemaPattern; // capture group 1 == prefix up to and including service name)
    if (this.rootUrl === 'https://taskcluster.net') {
      schemaPattern = new RegExp('(^https:\/\/schemas\.taskcluster\.net\/[^\/]*\/).*\.json#');
    } else {
      schemaPattern = new RegExp(`(^${regexEscape(this.rootUrl)}\/schemas\/[^\/]*\/).*\.json#`);
    }

    for (let {filename, content} of this.schemas) {
      if (!content.$id) {
        problems.push(`schema ${filename} has no $id`);
      } else if (!schemaPattern.test(content.$id)) {
        problems.push(`schema ${filename} has an invalid $id '${content.$id}' ` +
          '(expected \'/schemas/<something>/something>.json#\'');
      }

      if (!content.$schema) {
        problems.push(`schema ${filename} has no $schema`);
      } else if (!content.$schema.startsWith('http://json-schema.org') && !this._getSchema(content.$schema)) {
        problems.push(`schema ${filename} has invalid $schema (must be defined here or be on at json-schema.org)`);
      }
    }

    const metadataMetaschema = libUrls.schema(this.rootUrl, 'common', 'metadata-metaschema.json#');
    for (let {filename, content} of this.references) {
      if (!content.$schema) {
        problems.push(`reference ${filename} has no $schema`);
      } else if (!this._getSchema(content.$schema)) {
        problems.push(`reference ${filename} has invalid $schema (must be defined here)`);
      } else {
        const schema = this._getSchema(content.$schema);
        if (schema.$schema !== metadataMetaschema) {
          problems.push(`reference ${filename} has schema '${content.$schema}' which does not have ` +
            'the metadata metaschema');
        }
      }
    }

    // if that was OK, check references in all schemas

    if (!problems.length) {
      for (let {filename, content} of this.schemas) {
        const idUrl = new URL(content.$id, this.rootUrl);

        const match = schemaPattern.exec(content.$id);
        const refRoot = new URL(match[1], this.rootUrl);

        const refOk = ref => {
          if (ref.startsWith('#')) {
            return true;  // URL doesn't like fragment-only relative URLs, but they are OK..
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
      const ajv = this._makeAjv({schemas: this.schemas});

      for (let {filename, content} of this.schemas) {
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

      for (let {filename, content} of this.references) {
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

    if (problems.length) {
      throw new ValidationProblems(problems);
    }

    this._validated = true;
  }

  /**
   * Write out a URI-structured form of this instance.
   */
  writeUriStructured({directory}) {
    writeUriStructured({
      directory,
      serializable: this.makeSerializable(),
    });
  }

  /**
   * Return a serializable form of this instance.
   */
  makeSerializable() {
    this.validate();
    return makeSerializable({references: this});
  }

  /**
   * Create an Ajv instance with all schemas and metaschemas installed,
   * using the given rootUrl (required because abstract schemas are not
   * valid).
   */
  makeAjv() {
    if (!this.rootUrl) {
      throw new Error('makeAjv is only valid on absolute References');
    }
    this.validate();
    return this._makeAjv();
  }

  _makeAjv({schemas}) {
    // validation requires an Ajv instance, so set that up without validating
    if (!this._ajv) {
      const ajv = new Ajv({
        format: 'full',
        verbose: true,
        allErrors: true,
        validateSchema: false,
      });

      ajv.addMetaSchema(require('ajv/lib/refs/json-schema-draft-06.json'));

      // identify metaschemas, so we can all addMetaSchema for them
      const metaSchemas = new Set(schemas.map(({content}) => content.$schema));
      for (let {content} of schemas) {
        // try to be resilient to bad schemas, as validation should be able to give
        // better error messages about schema problems.
        if (!content.$id) {
          return;
        }

        if (metaSchemas.has(content.$id)) {
          ajv.addMetaSchema(content);
        } else {
          ajv.addSchema(content);
        }
      }

      this._ajv = ajv;
    }
    return this._ajv;
  }

  /**
   * Get a particular schmea by its $id.
   */
  getSchema($id) {
    this.validate();
    return this._getSchema($id);
  }

  _getSchema($id) {
    if (!this._schemasById) {
      this._schemasById = this.schemas.reduce(
        (schemas, {content}) => schemas.set(content.$id, content), new Map());
    }

    return this._schemasById.get($id);
  }

  /**
   * Return a new instance that is not relative to any rootUrl.
   */
  asAbstract() {
    if (!this.rootUrl) {
      return new References(this);
    }

    let withoutRootUrl;
    if (this.rootUrl === 'https://taskcluster.net') {
      withoutRootUrl = uri => uri.replace(/^https:\/\/([^.]*)\.taskcluster\.net\//, '/$1/');
    } else {
      const rootUrlPrefix = new RegExp(`^${regexEscape(this.rootUrl)}`);
      withoutRootUrl = uri => uri.replace(rootUrlPrefix, '');
    }

    return new References({
      rootUrl: undefined,
      ...this._withRewrittenUrls(withoutRootUrl),
    });
  }

  /**
   * Return a new instance that is relative to the given rootUrl.
   */
  asAbsolute(rootUrl) {
    if (this.rootUrl) {
      return this.asAbstract().asAbsolute(rootUrl);
    }

    let withRootUrl;
    if (rootUrl === 'https://taskcluster.net') {
      const rootUrlPrefix = /^\/(references|schemas)\//;
      withRootUrl = uri => uri.replace(rootUrlPrefix, 'https://$1.taskcluster.net/');
    } else {
      withRootUrl = uri => uri[0] === '/' ? rootUrl + uri : uri;
    }

    return new References({
      rootUrl,
      ...this._withRewrittenUrls(withRootUrl),
    });
  }

  _withRewrittenUrls(rewrite) {
    return {
      references:
        this.references.map(({content, filename}) => ({
          content: {
            ...content,
            $schema: content.$schema && rewrite(content.$schema),
          },
          filename,
        })),
      schemas:
        this.schemas.map(({content, filename}) => ({
          content: {
            ...content,
            $schema: content.$schema && rewrite(content.$schema),
            $id: content.$id && rewrite(content.$id),
          },
          filename,
        })),
    };
  }
}

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

exports.References = References;
