const debug = require('debug')('taskcluster-lib-validate');
const _ = require('lodash');
const fs = require('fs');
const path = require('path');
const walk = require('walk');
const yaml = require('js-yaml');
const assert = require('assert');
const Ajv = require('ajv');
const libUrls = require('taskcluster-lib-urls');
const {renderConstants, checkRefs} = require('./util');

const REPO_ROOT = path.join(__dirname, '../../../');
const ABSTRACT_SCHEMA_ROOT_URL = '';

class SchemaSet {
  constructor(options) {
    assert(options.serviceName, 'A `serviceName` must be provided to taskcluster-lib-validate!');

    this._schemas = {};

    const defaultFolder = path.join(REPO_ROOT, 'services', options.serviceName, 'schemas');
    this.cfg = _.defaults(options, {
      folder: defaultFolder,
      constants: path.join(options && options.folder || defaultFolder, 'constants.yml'),
    });

    if (_.isString(this.cfg.constants)) {
      const fullpath = path.resolve(this.cfg.constants);
      debug('Attempting to set constants by file: %s', fullpath);
      try {
        this.cfg.constants = yaml.safeLoad(fs.readFileSync(fullpath, 'utf-8'));
      } catch (err) {
        if (err.code === 'ENOENT') {
          debug('Constants file does not exist, setting constants to {}');
          this.cfg.constants = {};
        } else {
          throw err;
        }
      }
    }

    let walkErr;
    walk.walkSync(path.resolve(this.cfg.folder), {listeners: {file: (root, stats) => {
      try {
        let name = path.relative(this.cfg.folder, path.join(root, stats.name));

        let json = null;
        const data = fs.readFileSync(path.join(this.cfg.folder, name), 'utf-8');
        if (/\.ya?ml$/.test(name) && name !== 'constants.yml') {
          json = yaml.safeLoad(data);
        } else if (/\.json$/.test(name)) {
          json = JSON.parse(data);
        } else {
          debug('Ignoring file %s', name);
          return;
        }

        const jsonName = name.replace(/\.ya?ml$/, '.json');
        const schema = renderConstants(json, this.cfg.constants);

        checkRefs(schema, this.cfg.serviceName);

        if (schema.id || schema.$id) {
          debug('Schema incorrectly attempts to set own id: %s', name);
          throw new Error('Schema ' + path.join(root, name) + ' attempts to set own id!');
        }

        this._schemas[jsonName] = schema;
      } catch (err) {
        // walk swallows errors, so we must raise them ourselves
        if (!walkErr) {
          walkErr = err;
        }
      }
    }}});
    if (walkErr) {
      throw walkErr;
    }

    debug('finished walking tree of schemas');
  }

  _schemaWithIds(rootUrl) {
    return _.mapValues(this._schemas, (schema, jsonName) => {
      const newSchema = _.clone(schema);
      newSchema.$id = libUrls.schema(rootUrl, this.cfg.serviceName, jsonName + '#');
      // rewrite a relative `/schemas/<service>/<path>..` URI to point to a full URL
      const match = /^\/schemas\/([^\/]*)\/(.*)$/.exec(newSchema.$schema);
      if (match) {
        newSchema.$schema = libUrls.schema(rootUrl, match[1], match[2]);
      }
      return newSchema;
    });
  }

  abstractSchemas() {
    return this._schemaWithIds(ABSTRACT_SCHEMA_ROOT_URL);
  }

  absoluteSchemas(rootUrl) {
    return this._schemaWithIds(rootUrl);
  }

  async validator(rootUrl) {
    const ajv = Ajv({
      useDefaults: true,
      format: 'full',
      verbose: true,
      // schema validation occurs in the tests and need not be done here
      validateSchema: false,
      allErrors: true,
    });
    ajv.addMetaSchema(require('ajv/lib/refs/json-schema-draft-06.json'));
    _.forEach(this.absoluteSchemas(rootUrl), schema => {
      ajv.addSchema(schema);
    });

    return (obj, id) => {
      id = id.replace(/#$/, '');
      id = id.replace(/\.ya?ml$/, '.json');
      if (!_.endsWith(id, '.json')) {
        id += '.json';
      }
      id += '#';
      ajv.validate(id, obj);
      if (ajv.errors) {
        _.forEach(ajv.errors, function(error) {
          if (error.params['additionalProperty']) {
            error.message += ': ' + JSON.stringify(error.params['additionalProperty']);
          }
        });
        return [
          '\nSchema Validation Failed!',
          '\nRejecting Schema: ',
          id,
          '\nErrors:\n  * ',
          ajv.errorsText(ajv.errors, {separator: '\n  * '}),
        ].join('');
      }
      return null;
    };
  }
}

module.exports = SchemaSet;
