const builtServices = require('./built-services');
const {makeSerializable, fromSerializable} = require('./serializable');
const {writeUriStructured, readUriStructured} = require('./uri-structured');
const {getCommonSchemas} = require('./common-schemas');
const Ajv = require('ajv');
const merge = require('lodash/merge');
const regexEscape = require('regex-escape');
const {validate} = require('./validate');

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
   * Create a new representation from the components of a service.  This is used
   * within services' tests to validate that their references and schemas are
   * valid.  It returns an abstract References instance.
   */
  static fromService({schemaset, exchanges, builder, monitorBuilder}) {
    const references = [];
    if (builder) {
      references.push({filename: 'api-reference.json', content: builder.reference()});
    }
    if (exchanges) {
      references.push({filename: 'exchanges-reference.json', content: exchanges.reference()});
    }
    if (monitorBuilder) {
      references.push({filename: 'logs-reference.json', content: monitorBuilder.reference()});
    }

    const schemas = Array.from(getCommonSchemas());
    Object.entries(schemaset.abstractSchemas()).forEach(([filename, content]) => {
      schemas.push({filename, content});
    });

    return new References({references, schemas});
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

    validate(this);

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
  makeAjv(options={}) {
    if (!this.rootUrl) {
      throw new Error('makeAjv is only valid on absolute References');
    }

    if (!options.skipValidation) {
      this.validate();
    }

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
      const metaSchemas = new Set(this.schemas.map(({content}) => content.$schema));
      for (let {content} of this.schemas) {
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
  getSchema($id, options={}) {
    if (!options.skipValidation) {
      this.validate();
    }

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

exports.References = References;
