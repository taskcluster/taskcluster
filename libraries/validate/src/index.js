import debugFactory from 'debug';
const debug = debugFactory('taskcluster-lib-validate');
import _ from 'lodash';
import fs from 'fs';
import { readFile } from 'fs/promises';
import path from 'path';
import walk from 'walk';
import yaml from 'js-yaml';
import assert from 'assert';
import libUrls from 'taskcluster-lib-urls';
import Ajv from 'ajv';
import addFormats from 'ajv-formats';
import { renderConstants, checkRefs } from './util.js';

const __dirname = new URL('.', import.meta.url).pathname;

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
        this.cfg.constants = yaml.load(fs.readFileSync(fullpath, 'utf-8'));
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
    walk.walkSync(path.resolve(this.cfg.folder), { listeners: { file: (root, stats) => {
      try {
        let name = path.relative(this.cfg.folder, path.join(root, stats.name));

        let json = null;
        const data = fs.readFileSync(path.join(this.cfg.folder, name), 'utf-8');
        if (/\.ya?ml$/.test(name) && name !== 'constants.yml') {
          json = yaml.load(data);
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
    } } });
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
    const ajv = new Ajv.default({
      useDefaults: true,
      validateFormats: true,
      verbose: true,
      // schema validation occurs in the tests and need not be done here
      validateSchema: false,
      allErrors: true,
    });

    addFormats(ajv);
    // json-schema-draft-07.json is added to metadata by ajv by default
    // since some schemas depend on draft-06, we must add it manually
    // and to avoid referencing node_modules to load file in ESM world, we copy it here
    // json-schema-draft-06.json was copied directly from 'ajv/lib/refs/json-schema-draft-06.json'
    ajv.addMetaSchema(JSON.parse(
      await readFile(path.join(__dirname, 'json-schema-draft-06.json'), 'utf8'),
    ));
    _.forEach(this.absoluteSchemas(rootUrl), schema => {
      ajv.addSchema(schema);
    });

    return (obj, id) => {
      id = id.replace(/#$/, '');
      id = id.replace(/\.ya?ml$/, '.json');
      if (!/#/.test(id)) {
        if (!_.endsWith(id, '.json')) {
          id += '.json';
        }
        id += '#';
      }
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
          ajv.errorsText(ajv.errors, { separator: '\n  * ' }),
        ].join('');
      }
      return null;
    };
  }
}

export default SchemaSet;
